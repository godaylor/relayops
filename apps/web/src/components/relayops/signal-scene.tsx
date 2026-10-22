import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { Check, Pause, Play, Radio, UserRound, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./signal-scene-motion.css";

const STORY_DURATION = 3_600;

// This is an explicitly labeled explanation, never an operational data source.
export function SignalScene({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const sceneRef = useRef<HTMLDivElement>(null);
  const pointerBounds = useRef<DOMRect | null>(null);
  const elapsed = useRef(0);
  const storyCycle = useRef(0);
  const [stage, setStage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [storyTransition, setStoryTransition] = useState(true);
  const running = !reduce && !paused && inView && visible;
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const x = useSpring(pointerX, { stiffness: 100, damping: 20 });
  const y = useSpring(pointerY, { stiffness: 100, damping: 20 });
  const transform = useMotionTemplate`translate3d(${x}px, ${y}px, 0)`;

  useEffect(() => {
    const visibilityChanged = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", visibilityChanged);
    const scene = sceneRef.current;
    const observer =
      scene && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
        : null;
    if (scene) observer?.observe(scene);
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (compact || !running) return;
    const started = performance.now();
    const cycle = storyCycle.current;
    let completed = false;
    const timer = window.setTimeout(
      () => {
        completed = true;
        elapsed.current = 0;
        setStoryTransition(true);
        setStage((stage + 1) % 4);
      },
      Math.max(0, STORY_DURATION - elapsed.current),
    );
    return () => {
      window.clearTimeout(timer);
      if (!completed && cycle === storyCycle.current) {
        elapsed.current = Math.min(
          STORY_DURATION,
          elapsed.current + performance.now() - started,
        );
      }
    };
  }, [compact, running, stage]);

  useEffect(() => {
    if (reduce) elapsed.current = 0;
    if (!running) {
      pointerX.set(0);
      pointerY.set(0);
    }
  }, [running, reduce, pointerX, pointerY]);

  useEffect(() => {
    let frame = 0;
    const refreshBounds = () => {
      if (!pointerBounds.current || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        pointerBounds.current =
          sceneRef.current?.getBoundingClientRect() ?? null;
      });
    };
    // Pointer movement never measures layout. Resize/scroll invalidations are
    // batched, and only matter while the pointer is actually inside the art.
    window.addEventListener("resize", refreshBounds);
    window.addEventListener("scroll", refreshBounds, true);
    return () => {
      window.removeEventListener("resize", refreshBounds);
      window.removeEventListener("scroll", refreshBounds, true);
      cancelAnimationFrame(frame);
    };
  }, []);

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
  return (
    <div
      ref={sceneRef}
      className={`signal-scene ${compact ? "is-compact" : ""}`}
      data-stage={stage}
      data-motion-running={running}
      data-story-transition={storyTransition}
      onPointerEnter={(event) => {
        if (!running || event.pointerType !== "mouse") return;
        pointerBounds.current = event.currentTarget.getBoundingClientRect();
      }}
      onPointerMove={(event) => {
        const bounds = pointerBounds.current;
        if (!running || event.pointerType !== "mouse" || !bounds) return;
        pointerX.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 22);
        pointerY.set(((event.clientY - bounds.top) / bounds.height - 0.5) * 16);
      }}
      onPointerLeave={() => {
        pointerBounds.current = null;
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
          width={compact ? 512 : 1600}
          height={compact ? 512 : 900}
          alt=""
          draggable={false}
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
          {stages.map(({ icon: StageIcon, label, detail }, index) => (
            <div
              className="signal-story-card"
              key={label}
              data-active={index === stage}
              aria-hidden={index !== stage}
            >
              <span className="signal-story-icon">
                <StageIcon size={19} aria-hidden="true" />
              </span>
              <div>
                <strong>{label}</strong>
                <p>{detail}</p>
              </div>
              <span className="signal-story-step">0{index + 1}</span>
            </div>
          ))}
          <fieldset
            className="signal-progress"
            aria-label={t("relayops:brand.visualDemo")}
          >
            {stages.map((item, index) => (
              <button
                type="button"
                key={item.label}
                aria-label={item.label}
                aria-pressed={index === stage}
                onClick={(event) => {
                  if (index === stage) return;
                  storyCycle.current += 1;
                  elapsed.current = 0;
                  setStoryTransition(event.detail !== 0);
                  setStage(index);
                }}
              >
                <span data-active={index === stage} />
              </button>
            ))}
          </fieldset>
        </>
      )}
      {!reduce ? (
        <button
          type="button"
          className="signal-motion-toggle"
          aria-label={t(
            paused
              ? "relayops:brand.resumeAnimation"
              : "relayops:brand.pauseAnimation",
          )}
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? (
            <Play size={15} aria-hidden="true" />
          ) : (
            <Pause size={15} aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );
}
