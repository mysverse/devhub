"use client";

import { motion, Variants } from "motion/react";
import { AnimateNumber, type AnimateNumberProps } from "motion-plus/react";
import { useEffect, useState } from "react";

export const FADE_UP_ANIMATION_VARIANTS: Variants = {
	hidden: { opacity: 0, y: 10 },
	show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } },
};

export const STAGGER_CHILD_VARIANTS: Variants = {
	hidden: { opacity: 0, y: 20 },
	show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 50 } },
};

export function StaggerContainer({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<motion.div
			initial="hidden"
			animate="show"
			viewport={{ once: true }}
			variants={{
				hidden: {},
				show: {
					transition: {
						staggerChildren: 0.15,
					},
				},
			}}
			className={className}
		>
			{children}
		</motion.div>
	);
}

export function StaggerItem({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<motion.div variants={STAGGER_CHILD_VARIANTS} className={className}>
			{children}
		</motion.div>
	);
}

export function FadeIn({
	children,
	className,
	delay = 0,
}: {
	children: React.ReactNode;
	className?: string;
	delay?: number;
}) {
	return (
		<motion.div
			initial="hidden"
			animate="show"
			variants={FADE_UP_ANIMATION_VARIANTS}
			transition={{ delay }}
			className={className}
		>
			{children}
		</motion.div>
	);
}

export function AnimatedNumber({
	value,
	format,
}: {
	value: number;
	format?: AnimateNumberProps["format"];
}) {
	const [displayed, setDisplayed] = useState(0);

	useEffect(() => {
		setDisplayed(value);
	}, [value]);

	return <AnimateNumber format={format}>{displayed}</AnimateNumber>;
}
