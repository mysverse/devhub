"use client";

import {
  Anchor,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Modal,
  Stack,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  Text,
  Textarea,
  VisuallyHidden,
} from "@mantine/core";
import {
  Camera,
  ClipboardCheck,
  Eye,
  ImagePlus,
  MessageSquareText,
  PenLine,
  Upload,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  submitPptProgress,
  submitPptProof,
} from "@/app/dashboard/ppts/actions";
import AiAssistBar from "@/components/ai-assist/AiAssistBar";
import { useAiAssist } from "@/components/ai-assist/useAiAssist";
import {
  MODAL_TRANSITION,
  OVERLAY_PROPS,
  ScaleIn,
  Shake,
} from "@/components/animations";
import LinearMarkdown from "@/components/LinearMarkdown";
import { signIn } from "@/lib/auth-client";
import {
  ATTACHMENT_MAX_FILES,
  acceptForSurface,
  checkAttachmentSelection,
  describeAttachmentLimits,
  isAttachmentImage,
} from "@/lib/ppt-attachment-policy";
import {
  AttachmentUploadError,
  discardAttachment,
  uploadAttachment,
} from "@/lib/ppt-attachment-upload-client";
import {
  describeUnmet,
  evaluateComposerRequirements,
  PPT_COMPOSER_MODES,
  type PptComposerMode,
  unmetRequired,
} from "@/lib/ppt-composer-config";
import type { ComposerAttachment } from "./AttachmentTile";
import AttachmentTray from "./AttachmentTray";
import styles from "./PptComposer.module.css";
import RequirementChecklist from "./RequirementChecklist";
import { useComposerDraft } from "./useComposerDraft";
import { type FileSource, useDropAndPaste } from "./useDropAndPaste";

/** React-side half of the mode table; the config module stays free of JSX. */
const MODE_ICONS: Record<PptComposerMode, ReactNode> = {
  progress: <MessageSquareText size={14} />,
  proof: <ClipboardCheck size={14} />,
};

/**
 * What browsers call a pasted screenshot. Chrome and Firefox both hand over
 * `image.png`, so a proof comment with three pastes arrives in Linear as three
 * attachments named `image.png` — indistinguishable a month later when an
 * admin is trying to verify the payout.
 */
const GENERIC_PASTE_NAME =
  /^(image|screenshot|clipboard|unknown|pasted[-_ ]?image)$/i;

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ppt"
  );
}

function renamePastedFile(file: File, slug: string, sequence: number) {
  const dot = file.name.lastIndexOf(".");
  const base = dot > 0 ? file.name.slice(0, dot) : file.name;
  const extension = dot > 0 ? file.name.slice(dot) : ".png";
  if (!GENERIC_PASTE_NAME.test(base)) return file;

  return new File([file], `screenshot-${slug}-${sequence}${extension}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export type PptComposerModalProps = {
  mode: PptComposerMode;
  opened: boolean;
  onClose: () => void;
  issueId: string;
  /** Linear identifier (MYS-201). Titles the sheet and names pasted screenshots. */
  identifier?: string;
  /** Linear issue URL, for the "open in Linear" escape hatch. */
  issueUrl?: string;
};

/**
 * The one composer behind both the Progress and Proof buttons.
 *
 * Two behaviours are deliberate and were previously bugs:
 *
 * - **The modal stays open across the submit.** Both buttons used to `close()`
 *   before starting the transition and `open()` again on failure, so a
 *   server-side rejection visibly re-opened the dialog and threw away the
 *   caret. Now the submit button carries the loading state and the modal
 *   closes only on success.
 * - **Nothing is red until a submit is blocked.** The old red Textarea error
 *   appeared on the first keystroke, telling developers they were wrong for
 *   having started typing.
 */
export default function PptComposerModal({
  mode,
  opened,
  onClose,
  issueId,
  identifier,
  issueUrl,
}: PptComposerModalProps) {
  const config = PPT_COMPOSER_MODES[mode];

  const { body, setBody, restoredAt, resetToTemplate } = useComposerDraft({
    mode,
    issueId,
    template: config.template,
  });

  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [tab, setTab] = useState<string | null>("write");
  const [attempted, setAttempted] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [liveMessage, setLiveMessage] = useState("");
  const [submitting, startSubmitTransition] = useTransition();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const browseRef = useRef<HTMLButtonElement>(null);
  const resetPickerRef = useRef<() => void>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const screenshotSequence = useRef(0);
  /** Mirror of `attachments` for cleanup paths that must not re-render. */
  const attachmentsRef = useRef<ComposerAttachment[]>([]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  // Object URLs are process-wide allocations: without this every screenshot a
  // developer previews stays resident until the tab is closed.
  useEffect(() => {
    const inFlight = controllers.current;
    return () => {
      for (const controller of inFlight.values()) controller.abort();
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
    };
  }, []);

  const uploading = attachments.some(
    (attachment) => attachment.status === "uploading",
  );
  const readyIds = useMemo(
    () =>
      attachments
        .map((attachment) => attachment.uploaded?.id)
        .filter((id): id is string => Boolean(id)),
    [attachments],
  );

  const results = useMemo(
    () =>
      evaluateComposerRequirements(mode, {
        body,
        attachmentCount: readyIds.length,
      }),
    [mode, body, readyIds.length],
  );

  // Announces through the composer's own live region rather than adding a
  // second one: two polite regions in one dialog interleave unpredictably.
  const assist = useAiAssist({
    fieldId: mode === "proof" ? "ppt_proof" : "ppt_progress",
    value: body,
    onChange: setBody,
    textareaRef,
    disabled: submitting,
    onAnnounce: setLiveMessage,
  });

  const updateAttachment = useCallback(
    (localId: string, patch: Partial<ComposerAttachment>) => {
      setAttachments((previous) =>
        previous.map((attachment) =>
          attachment.localId === localId
            ? { ...attachment, ...patch }
            : attachment,
        ),
      );
    },
    [],
  );

  const startUpload = useCallback(
    (localId: string, file: File) => {
      const controller = new AbortController();
      controllers.current.set(localId, controller);

      uploadAttachment(file, {
        issueId,
        kind: mode,
        signal: controller.signal,
        onProgress: (fraction) =>
          updateAttachment(localId, { progress: fraction }),
      })
        .then((uploaded) => {
          updateAttachment(localId, {
            status: "done",
            progress: 1,
            uploaded,
            error: null,
          });
        })
        .catch((error: unknown) => {
          // Aborted means the tile was removed or the composer unmounted —
          // there is nothing left to report the failure on.
          if (controller.signal.aborted) return;

          if (error instanceof AttachmentUploadError && error.reauth) {
            signIn.oauth2({ providerId: "linear", callbackURL: "/dashboard" });
            return;
          }
          const message =
            error instanceof Error
              ? error.message
              : "Upload failed — try again.";
          updateAttachment(localId, { status: "error", error: message });
          toast.error(message);
        })
        .finally(() => {
          controllers.current.delete(localId);
        });
    },
    [issueId, mode, updateAttachment],
  );

  const addFiles = useCallback(
    // Wider than the hook's own union: files can also arrive from the picker,
    // and only a paste needs the generic-name rename.
    (incoming: File[], source: FileSource | "pick") => {
      if (incoming.length === 0) return;

      const slug = slugify(identifier ?? "ppt");
      const named =
        source === "paste"
          ? incoming.map((file) => {
              screenshotSequence.current += 1;
              return renamePastedFile(file, slug, screenshotSequence.current);
            })
          : incoming;

      const current = attachmentsRef.current;
      if (current.length + named.length > ATTACHMENT_MAX_FILES) {
        toast.error(`You can attach up to ${ATTACHMENT_MAX_FILES} files.`);
        return;
      }

      // The whole selection is validated, not just the new files: the total
      // ceiling is what the server enforces per comment.
      const rejection = checkAttachmentSelection(
        [...current.map((attachment) => attachment.file), ...named],
        "ppt-comment",
      );
      if (rejection) {
        toast.error(rejection.error);
        return;
      }

      const entries: ComposerAttachment[] = named.map((file) => ({
        localId: crypto.randomUUID(),
        file,
        // Only images get a thumbnail; a video object URL would make the
        // browser start buffering the file we are already uploading.
        previewUrl: isAttachmentImage(file.type)
          ? URL.createObjectURL(file)
          : null,
        status: "uploading",
        progress: 0,
        uploaded: null,
        error: null,
      }));

      setAttachments((previous) => [...previous, ...entries]);
      for (const entry of entries) startUpload(entry.localId, entry.file);
    },
    [identifier, startUpload],
  );

  const removeAttachment = useCallback((localId: string) => {
    const target = attachmentsRef.current.find(
      (attachment) => attachment.localId === localId,
    );
    if (target) {
      controllers.current.get(localId)?.abort();
      controllers.current.delete(localId);
      if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
      // Already on Linear but never claimed by a comment — tell the server to
      // drop the row now rather than waiting for the retention sweep.
      if (target.uploaded) discardAttachment(target.uploaded.id);
    }
    setAttachments((previous) =>
      previous.filter((attachment) => attachment.localId !== localId),
    );
  }, []);

  const retryAttachment = useCallback(
    (localId: string) => {
      const target = attachmentsRef.current.find(
        (attachment) => attachment.localId === localId,
      );
      if (!target) return;
      updateAttachment(localId, {
        status: "uploading",
        progress: 0,
        error: null,
      });
      startUpload(localId, target.file);
    },
    [startUpload, updateAttachment],
  );

  const { isDragging, panelProps, onPaste } = useDropAndPaste({
    onFiles: addFiles,
    disabled: submitting,
  });

  /** Drops every upload that never made it into a comment. */
  function discardAll() {
    for (const controller of controllers.current.values()) controller.abort();
    controllers.current.clear();
    for (const attachment of attachmentsRef.current) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      if (attachment.uploaded) discardAttachment(attachment.uploaded.id);
    }
    setAttachments([]);
  }

  const busy = submitting || uploading;

  function handleClose() {
    if (busy) return;
    discardAll();
    setAttempted(false);
    setLiveMessage("");
    setTab("write");
    onClose();
  }

  function block(message: string) {
    setAttempted(true);
    setShakeKey((key) => key + 1);
    setLiveMessage(message);
  }

  function handleSubmit() {
    if (submitting) return;
    if (uploading) {
      block("Not posted yet. Wait for the attachments to finish uploading.");
      return;
    }

    // A failed tile would otherwise be silently left out of the comment — the
    // developer thinks they attached three screenshots and posted two.
    if (attachments.some((attachment) => attachment.status === "error")) {
      block(
        "Not posted yet. Retry or remove the attachment that failed to upload.",
      );
      return;
    }

    const blocking = unmetRequired(results);
    if (blocking.length > 0) {
      block(describeUnmet(blocking));
      return;
    }

    setLiveMessage("");
    const draft = body;
    const attachmentIds = readyIds;
    const toastId = toast.loading(config.pendingToast);

    startSubmitTransition(async () => {
      const result =
        mode === "proof"
          ? await submitPptProof(issueId, draft, attachmentIds)
          : await submitPptProgress(issueId, draft, attachmentIds);

      if ("reauth" in result && result.reauth) {
        signIn.oauth2({ providerId: "linear", callbackURL: "/dashboard" });
        return;
      }
      if ("error" in result && result.error) {
        // Stay open with the body and the attachments intact: the draft is the
        // expensive thing here, and the fix is usually one sentence away.
        toast.error(result.error, { id: toastId });
        return;
      }

      toast.success(config.successToast, { id: toastId });
      // Posted — the rows now belong to the comment, so they must NOT be
      // discarded. Only the local previews are ours to release.
      for (const attachment of attachmentsRef.current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      }
      controllers.current.clear();
      setAttachments([]);
      resetToTemplate();
      setAttempted(false);
      setTab("write");
      onClose();
    });
  }

  function insertSnippet(text: string) {
    const element = textareaRef.current;
    if (!element) {
      setBody(body ? `${body}\n${text}` : text);
      return;
    }

    const start = element.selectionStart ?? body.length;
    const end = element.selectionEnd ?? start;
    const before = body.slice(0, start);
    const after = body.slice(end);
    // Snippets are line-leading labels, so give them their own line unless the
    // caret already sits at the start of one.
    const lead = before.length === 0 || before.endsWith("\n") ? "" : "\n";
    setBody(`${before}${lead}${text}${after}`);

    const caret = before.length + lead.length + text.length;
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(caret, caret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Plain Enter has to stay a newline: every one of these bodies is
    // multi-line, and the template is four lines before anyone types anything.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handlePicked(picked: File[] | null) {
    if (picked && picked.length > 0) addFiles(picked, "pick");
    // Without the reset, picking the same file twice in a row is a no-op.
    resetPickerRef.current?.();
  }

  const remaining = config.maxChars - body.length;

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      centered
      size="lg"
      radius="md"
      transitionProps={MODAL_TRANSITION}
      overlayProps={{ ...OVERLAY_PROPS }}
      closeButtonProps={{ "aria-label": "Close composer", disabled: busy }}
      classNames={{
        inner: styles.modalInner,
        content: styles.modalContent,
        header: styles.modalHeader,
        body: styles.modalBody,
      }}
      title={
        <Group gap="xs" wrap="nowrap">
          <Text fw={700}>{config.title}</Text>
          {identifier && (
            <Badge size="sm" variant="light" color="gray">
              {identifier}
            </Badge>
          )}
        </Group>
      }
    >
      <Stack gap="md">
        <Group
          gap="xs"
          justify="space-between"
          align="flex-start"
          wrap="nowrap"
        >
          <Text size="sm" c="dimmed" style={{ flex: 1 }}>
            {config.intro}
          </Text>
          {issueUrl && (
            <Anchor href={issueUrl} target="_blank" size="xs" fw={500}>
              Open in Linear
            </Anchor>
          )}
        </Group>

        {restoredAt && (
          <Group gap="xs" justify="space-between" wrap="nowrap">
            <Text size="xs" c="dimmed">
              Draft restored from {new Date(restoredAt).toLocaleString()}.
            </Text>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={resetToTemplate}
            >
              Start over
            </Button>
          </Group>
        )}

        <Tabs value={tab} onChange={setTab}>
          <TabsList>
            <TabsTab value="write" leftSection={<PenLine size={13} />}>
              Write
            </TabsTab>
            <TabsTab value="preview" leftSection={<Eye size={13} />}>
              Preview
            </TabsTab>
          </TabsList>

          <TabsPanel value="write" pt="sm">
            {/* The whole panel is the drop target, not just the textarea: a
                screenshot dragged onto the attachment tray or the buttons is
                still a screenshot someone meant to attach. */}
            <div
              className={styles.writePanel}
              data-dragging={isDragging || undefined}
              onPaste={onPaste}
              {...panelProps}
            >
              <Stack gap="xs">
                <Textarea
                  ref={textareaRef}
                  data-autofocus
                  autosize
                  minRows={7}
                  maxRows={16}
                  maxLength={config.maxChars}
                  value={body}
                  placeholder={config.placeholder}
                  onChange={(event) => setBody(event.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={onPaste}
                  // readOnly, never disabled: disabling the focused textarea
                  // blurs it, which is the caret loss this rewrite exists to
                  // end. The body still has to be frozen while it is in flight
                  // — including while a rewrite is being fetched for it, since
                  // the reply is spliced against the text that was sent.
                  readOnly={submitting || assist.busy}
                />

                <Group gap={6}>
                  {config.snippets.map((snippet) => (
                    <Button
                      key={snippet.label}
                      size="compact-xs"
                      variant="default"
                      onClick={() => insertSnippet(snippet.text)}
                      disabled={submitting}
                    >
                      {snippet.label}
                    </Button>
                  ))}
                  {/* Only worth the pixels near the cap — `maxLength` on the
                      textarea is what actually enforces it. */}
                  {remaining <= 500 && (
                    <Text size="xs" c="dimmed" ml="auto">
                      {remaining} characters left
                    </Text>
                  )}
                </Group>

                <AiAssistBar assist={assist} compact />

                <AttachmentTray
                  attachments={attachments}
                  onRemove={removeAttachment}
                  onRetry={retryAttachment}
                  fallbackFocusRef={browseRef}
                />

                <Group gap="xs">
                  <FileButton
                    multiple
                    resetRef={resetPickerRef}
                    accept={acceptForSurface("ppt-comment")}
                    onChange={handlePicked}
                    disabled={submitting}
                  >
                    {(props) => (
                      <Button
                        {...props}
                        ref={browseRef}
                        size="xs"
                        variant="light"
                        leftSection={<ImagePlus size={14} />}
                      >
                        Attach files
                      </Button>
                    )}
                  </FileButton>

                  {/* Phones have no drag source and no clipboard screenshot —
                      the camera is the equivalent affordance there. */}
                  <Group hiddenFrom="sm" gap="xs">
                    <FileButton
                      accept="image/*"
                      capture="environment"
                      onChange={(file) => handlePicked(file ? [file] : null)}
                      disabled={submitting}
                    >
                      {(props) => (
                        <Button
                          {...props}
                          size="xs"
                          variant="default"
                          leftSection={<Camera size={14} />}
                        >
                          Take photo
                        </Button>
                      )}
                    </FileButton>
                  </Group>
                </Group>

                <Text size="xs" c="dimmed">
                  Paste a screenshot with Ctrl/Cmd+V, or drop files anywhere in
                  this panel. {describeAttachmentLimits("ppt-comment")}
                </Text>
              </Stack>

              {isDragging && (
                <ScaleIn className={styles.dropOverlay}>
                  <Upload size={18} />
                  <Text size="sm" fw={600}>
                    Drop to attach
                  </Text>
                </ScaleIn>
              )}
            </div>
          </TabsPanel>

          <TabsPanel value="preview" pt="sm">
            <Card withBorder radius="sm" padding="md" mih={200}>
              {body.trim() ? (
                <LinearMarkdown>{body}</LinearMarkdown>
              ) : (
                <Text size="sm" c="dimmed">
                  Nothing to preview yet.
                </Text>
              )}
              {attachments.length > 0 && (
                <Stack gap="xs" mt="md">
                  <Text size="xs" c="dimmed">
                    These are appended to the comment when you post:
                  </Text>
                  <AttachmentTray
                    readOnly
                    attachments={attachments}
                    onRemove={removeAttachment}
                    onRetry={retryAttachment}
                  />
                </Stack>
              )}
            </Card>
          </TabsPanel>
        </Tabs>

        <Shake trigger={shakeKey}>
          <RequirementChecklist
            title={config.checklistTitle}
            results={results}
            showErrors={attempted}
          />
        </Shake>

        {/* Shake renders nothing under prefers-reduced-motion (MotionConfig
            runs reducedMotion="user"), so the refusal has to be spoken too. */}
        <VisuallyHidden aria-live="polite">{liveMessage}</VisuallyHidden>

        <div className={styles.footer}>
          <Group justify="space-between" wrap="nowrap" gap="sm">
            {uploading ? (
              <Text size="xs" c="dimmed">
                Uploading…
              </Text>
            ) : (
              // Written statically and hidden on phones rather than branched on
              // navigator.platform: reading the platform during render is a
              // hydration mismatch, and phones have no modifier key anyway.
              <Text size="xs" c="dimmed" visibleFrom="sm">
                Ctrl / Cmd + Enter to post
              </Text>
            )}
            <Group gap="sm" wrap="nowrap" ml="auto">
              <Button variant="default" onClick={handleClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                color={config.color}
                onClick={handleSubmit}
                loading={submitting}
                disabled={uploading}
                leftSection={MODE_ICONS[mode]}
              >
                {config.submitLabel}
              </Button>
            </Group>
          </Group>
        </div>
      </Stack>
    </Modal>
  );
}
