import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { Check, Radio, UserRound, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// This is an explicitly labeled explanation, never an operational data source.
export function SignalScene({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [stage, setStage] = useState(0);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 100, damping: 20 });
  const y = useSpring(pointerY, { stiffness: 100, damping: 20 });
  const transform = useMotionTemplate`translate3d(${x}px, ${y}px, 0)`;
  useEffect(() => {
    if (compact || reduce) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setStage((value) => (value + 1) % 4);
    }, 3600);
    return () => window.clearInterval(timer);
  }, [compact, reduce]);
  const stages = [
    {
      icon: Radio,
      label: t("relayops:brand.sceneSignal"),
      detail: t("relayops:brand.sceneSignalDetail"),
    },
    {
      icon: UserRound,
      label: t("relayops:brand.sceneOwner"),
      detail: t("relayops:brand.sceneOwnerDetail"),
    },
    {
      icon: Wrench,
      label: t("relayops:brand.sceneAction"),
      detail: t("relayops:brand.sceneActionDetail"),
    },
    {
      icon: Check,
      label: t("relayops:brand.sceneResolved"),
      detail: t("relayops:brand.sceneResolvedDetail"),
    },
  ];
  const StageIcon = stages[stage].icon;
  return (
    <div
      className={`signal-scene ${compact ? "is-compact" : ""}`}
      data-stage={stage}
      onPointerMove={(event) => {
        if (reduce || event.pointerType === "touch") return;
        const bounds = event.currentTarget.getBoundingClientRect();
        pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 22);
        pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 16);
      }}
      onPointerLeave={() => {
        pointerX.set(0);
        pointerY.set(0);
      }}
    >
      <div className="signal-art-depth">
        <motion.img
          className="signal-sculpture"
          src={
            compact
              ? "/brand/sboritm-mark-512.webp"
              : "/brand/signal-sculpture.webp"
          }
          alt=""
          fetchPriority={compact ? "auto" : "high"}
          style={reduce ? undefined : { transform }}
        />
      </div>
      <svg
        className="signal-trails"
        viewBox="0 0 1000 580"
        fill="none"
        aria-hidden="true"
      >
        <path d="M0 420C220 420 220 140 580 190S850 400 1000 280" />
        <path d="M0 480C220 480 300 210 600 240S850 400 1000 280" />
        <path d="M0 540C250 540 380 300 660 300S850 400 1000 280" />
        {!reduce ? (
          <circle className="signal-traveler" r="3.5" fill="#ffc18f" />
        ) : null}
      </svg>
      {compact ? (
        <div className="signal-scene-caption">
          <span className="signal-dot" />
          {t("relayops:brand.sharedRhythm")}
        </div>
      ) : (
        <>
          <div className="signal-scene-top">
            <span>{t("relayops:brand.visualDemo")}</span>
            <span className="signal-orbit-dot" />
          </div>
          <div className="signal-story-card" key={stage}>
            <span className="signal-story-icon">
              <StageIcon size={19} />
            </span>
            <div>
              <strong>{stages[stage].label}</strong>
              <p>{stages[stage].detail}</p>
            </div>
            <span className="signal-story-step">0{stage + 1}</span>
          </div>
          <div className="signal-progress" aria-hidden="true">
            {stages.map((item, index) => (
              <span key={item.label} data-active={index === stage} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
