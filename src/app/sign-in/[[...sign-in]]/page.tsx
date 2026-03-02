import { SignIn } from "@clerk/nextjs";
import { Center } from "@mantine/core";

export default function Page() {
  return (
    <Center h="100vh" bg="var(--mantine-color-body)">
      <SignIn />
    </Center>
  );
}
