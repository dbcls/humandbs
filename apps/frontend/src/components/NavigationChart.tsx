import { useState, useRef, useEffect, lazy } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  NavigationFlowchartData,
  NavigationFlowchartOption,
  NavigationFlowchartStep,
} from "@/config/navigation-flowchart";
import {
  getNavigationEntryPointQueryOptions,
  getNavigationFlowchartByIdQueryOptions,
  getNavigationFlowchartNamesQueryOptions,
} from "@/serverFunctions/navigationFlowchart";
import type { Locale } from "@/config/i18n";

const MarkdownClientPreview = lazy(
  () => import("@/components/markdown/MarkdownClientPreview"),
);

// Legacy shape kept for backward compat with callers not yet migrated
export interface NavigationData {
  steps: Array<{
    id: string;
    title: string;
    text: string;
    options: Array<{
      id: string;
      title: string;
      nextStep?: string;
      link?: string;
      linkText?: string;
    }>;
  }>;
}

/** Answers keyed by flowchart answer-key (ENTRY_POINT_KEY or UUID), then by step ID. */
export type FlowchartAnswers = Record<string, Record<string, string>>;

interface NavigationChartProps {
  // DB-backed props
  /** ID of the flowchart to display (UUID). Required unless `entryPoint` is true. */
  flowchartId?: string;
  /** When true, fetches the entry-point flowchart (isEntryPoint = true) rather than by ID. */
  entryPoint?: boolean;
  /** The key used to namespace answers for this flowchart in the answers map. */
  answerKey?: string;
  locale?: Locale;
  answers?: FlowchartAnswers;
  onAnswerChange?: (
    slug: string,
    stepId: string,
    optionId: string,
    clearStepIds?: string[],
  ) => void;
  onNavigateToFlowchart?: (flowchartId: string) => void;
  // Legacy prop
  data?: NavigationData;
  navigate?: (options: { to: string }) => void;
}

interface BreadcrumbItem {
  slug: string;
  nameEn: string;
  nameJa: string;
  onClick?: () => void;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  locale?: Locale;
}

/**
 * Horizontal breadcrumb trail. The last item is the current location and is
 * rendered as non-interactive bold text. All preceding items are rendered as
 * clickable buttons if they have an `onClick` handler.
 */
function Breadcrumbs({ items, locale }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  return (
    <nav className="mb-4 flex items-center gap-2 text-sm text-gray-500">
      {items.map((item, i) => {
        const name = locale === "ja" ? item.nameJa : item.nameEn;
        const isLast = i === items.length - 1;
        return (
          <span key={item.slug} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-300">›</span>}
            {item.onClick && !isLast ? (
              <Button
                variant={"ghost"}
                size={"icon"}
                onClick={item.onClick}
                className="inline font-medium hover:text-gray-800 hover:underline"
              >
                {name}
              </Button>
            ) : (
              <span className={isLast ? "font-medium text-gray-700" : ""}>
                {name}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/**
 * Renders a single answer option inside a step.
 *
 * - Regular nextStep option: button with optional downward arrow when the target
 *   is the immediately adjacent step.
 * - linkedFlowchartId option: title + labelled navigation button (no arrow).
 * - External link option: title + anchor or internal-navigation button.
 *
 * Disabled once selected to prevent double-clicks; the parent step re-enables
 * all options of previously answered steps so the user can change their answer.
 */
const OptionComponent = ({
  option,
  locale,
  onOptionClick,
  isEnabled = true,
  isSelected = false,
  showArrow = true,
  linkedFlowchartName,
}: {
  option: NavigationFlowchartOption;
  locale?: Locale;
  onOptionClick: () => void;
  isEnabled?: boolean;
  isSelected?: boolean;
  showArrow?: boolean;
  linkedFlowchartName?: string;
}) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [buttonHeight, setButtonHeight] = useState<number>(0);

  const title = locale === "ja" ? option.title.ja : option.title.en;
  const linkText =
    locale === "ja"
      ? (option.linkText?.ja ?? option.linkText?.en)
      : (option.linkText?.en ?? option.linkText?.ja);

  function updateHeight() {
    if (buttonRef.current) setButtonHeight(buttonRef.current.offsetHeight);
  }

  useEffect(() => {
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [title]);

  const optionBaseClasses =
    "border-tetriary w-full rounded-xl border-3 bg-white p-3 font-bold transition-colors text-3xl";

  // Linked flowchart: show title + navigation button (same layout as external link)
  if (option.linkedFlowchartId) {
    const buttonLabel = linkedFlowchartName ?? "Continue →";
    return (
      <div
        className={cn(optionBaseClasses, "flex flex-col items-center gap-2", {
          "pointer-events-none cursor-not-allowed": !isEnabled || isSelected,
        })}
      >
        {title}
        <Button
          onClick={onOptionClick}
          className="px-8 text-sm disabled:opacity-100"
          size="slim"
          disabled={!isEnabled || isSelected}
        >
          {buttonLabel} →
        </Button>
      </div>
    );
  }

  if (option.link) {
    const displayText = linkText ?? option.link;
    const isExternal = option.link.startsWith("http");

    return (
      <div
        className={cn(optionBaseClasses, "flex flex-col items-center gap-2", {
          "pointer-events-none cursor-not-allowed": !isEnabled || isSelected,
        })}
      >
        {title}
        {isExternal ? (
          <a
            href={option.link}
            target="_blank"
            rel="noopener noreferrer"
            className="from-accent to-accent-light inline-block rounded bg-gradient-to-r px-8 py-1 text-sm text-white"
          >
            {displayText} →
          </a>
        ) : (
          <Button
            onClick={onOptionClick}
            className="px-8 text-sm disabled:opacity-100"
            size="slim"
            disabled={!isEnabled || isSelected}
          >
            {displayText} →
          </Button>
        )}
      </div>
    );
  }

  // nextStep: arrow shown only when target is the immediately next step
  const hasArrow = showArrow && !!option.nextStep;

  const arrow = hasArrow ? (
    <div
      className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center"
      style={{ height: `calc(100% - ${buttonHeight}px + 32px)` }}
    >
      <div className="bg-tetriary h-full w-[3px]" />
      <div className="border-t-tetriary h-0 w-0 border-t-8 border-r-8 border-l-8 border-r-transparent border-l-transparent" />
    </div>
  ) : null;

  return (
    <div>
      <button
        ref={buttonRef}
        onClick={onOptionClick}
        disabled={!isEnabled || isSelected}
        className={cn(optionBaseClasses, {
          "hover:bg-tetriary cursor-pointer hover:text-white":
            isEnabled && !isSelected,
        })}
      >
        {title}
      </button>
      {arrow}
    </div>
  );
};

/**
 * Renders a flowchart step: title, body text, and its options.
 *
 * Steps beyond `enabledStepIndex` are faded out (opacity-30) and their options
 * are pointer-events disabled. The current active step (`isCurrent`) receives a
 * `ring-secondary-light` highlight border.
 */
const StepComponent = ({
  step,
  stepIndex,
  allSteps,
  locale,
  linkedFlowchartNames,
  onOptionClick,
  isEnabled = true,
  isCurrent = false,
  selectedOptionId,
}: {
  step: NavigationFlowchartStep;
  stepIndex: number;
  allSteps: NavigationFlowchartStep[];
  locale?: Locale;
  linkedFlowchartNames: Record<string, string>;
  onOptionClick: (option: NavigationFlowchartOption, stepIndex: number) => void;
  isEnabled?: boolean;
  isCurrent?: boolean;
  selectedOptionId?: string;
}) => {
  const title = locale === "ja" ? step.title.ja : step.title.en;
  const text = locale === "ja" ? step.text.ja : step.text.en;

  return (
    <div className="relative">
      <div
        className={cn(
          "bg-primary rounded-xl px-16 py-7",
          isCurrent && "ring-secondary-light ring-4",
        )}
      >
        <h2 className="text-secondary mb-2 text-center text-4xl font-bold">
          {title}
        </h2>
        <p className="m-auto mb-5 w-2/3 max-w-3xl">
          <MarkdownClientPreview source={text} />
        </p>
        <div className="text-tetriary flex justify-center gap-8">
          {step.options.map((option) => {
            // Arrow only for nextStep pointing to the immediately following step.
            // Linked flowchart options never get an arrow.
            const targetIdx = option.nextStep
              ? allSteps.findIndex((s) => s.id === option.nextStep)
              : -1;
            const showArrow = targetIdx === stepIndex + 1;
            const linkedName = option.linkedFlowchartId
              ? linkedFlowchartNames[option.linkedFlowchartId]
              : undefined;
            return (
              <div
                key={option.id}
                className="relative w-[25vw] max-w-xl min-w-sm text-center"
              >
                <OptionComponent
                  option={option}
                  locale={locale}
                  onOptionClick={() => onOptionClick(option, stepIndex)}
                  isEnabled={isEnabled}
                  isSelected={selectedOptionId === option.id}
                  showArrow={showArrow}
                  linkedFlowchartName={linkedName}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * Core interactive flowchart renderer. Manages `enabledStepIndex` — the index
 * of the furthest step the user has unlocked via their answers.
 *
 * When the user clicks an option on any already-enabled step, all answers for
 * steps that come after it are cleared (`clearStepIds`) so stale downstream
 * state is removed. The `slug` (or UUID for linked flowcharts) is used as the
 * namespace key inside the `answers` map.
 */
function NavigationChartInner({
  flowchartId,
  slug,
  data,
  locale,
  answers,
  linkedFlowchartNames,
  onAnswerChange,
  onNavigateToFlowchart,
}: {
  flowchartId: string;
  slug: string;
  data: NavigationFlowchartData;
  locale?: Locale;
  answers: FlowchartAnswers;
  linkedFlowchartNames: Record<string, string>;
  onAnswerChange: (
    slug: string,
    stepId: string,
    optionId: string,
    clearStepIds?: string[],
  ) => void;
  onNavigateToFlowchart: (flowchartId: string) => void;
}) {
  const stepAnswers = answers[slug] ?? {};

  // Compute the furthest unlocked step index from existing answers
  const computeEnabledIndex = () => {
    let idx = 0;
    for (let i = 0; i < data.steps.length; i++) {
      const step = data.steps[i];
      const selectedOptionId = stepAnswers[step.id];
      if (!selectedOptionId) break;
      const option = step.options.find((o) => o.id === selectedOptionId);
      if (option?.nextStep) {
        const targetIdx = data.steps.findIndex((s) => s.id === option.nextStep);
        if (targetIdx !== -1) idx = targetIdx;
      }
    }
    return idx;
  };

  const [enabledStepIndex, setEnabledStepIndex] = useState(computeEnabledIndex);

  const handleOptionClick = (
    option: NavigationFlowchartOption,
    stepIndex: number,
  ) => {
    const step = data.steps[stepIndex];
    if (!step) return;
    // Allow clicking any step that is currently enabled (answered or current).
    if (stepIndex > enabledStepIndex) return;

    // When the user changes an answer on an already-answered step, clear all
    // answers for steps that appear after this one so stale state is removed.
    const stepsAfter = data.steps.slice(stepIndex + 1).map((s) => s.id);
    onAnswerChange(slug, step.id, option.id, stepsAfter);

    if (option.linkedFlowchartId) {
      onNavigateToFlowchart(option.linkedFlowchartId);
      return;
    }

    if (option.nextStep) {
      const targetIdx = data.steps.findIndex((s) => s.id === option.nextStep);
      setEnabledStepIndex(targetIdx !== -1 ? targetIdx : stepIndex + 1);
    } else {
      // Terminal option (no nextStep, no linkedFlowchartId) — stay at this step
      setEnabledStepIndex(stepIndex);
    }
  };

  return (
    <div className="relative my-8 flex min-w-5xl flex-col items-center gap-8">
      {data.steps.map((step, index) => {
        const isEnabled = index <= enabledStepIndex;
        const isCurrent = index === enabledStepIndex;
        return (
          <div
            key={step.id}
            className={cn(
              "transition-opacity duration-300",
              isEnabled ? "opacity-100" : "opacity-30",
            )}
          >
            <StepComponent
              step={step}
              stepIndex={index}
              allSteps={data.steps}
              locale={locale}
              linkedFlowchartNames={linkedFlowchartNames}
              onOptionClick={handleOptionClick}
              isEnabled={isEnabled}
              isCurrent={isCurrent}
              selectedOptionId={stepAnswers[step.id]}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Entry-point component for the public flowchart UI.
 *
 * Routes to the correct data-fetching variant:
 * - `data` prop (legacy): static JSON, no DB.
 * - `entryPoint=true`: fetches the single entry-point flowchart (isEntryPoint = true).
 * - `flowchartId`: fetches a flowchart by UUID (used for linked flowcharts).
 */
function NavigationChart({
  flowchartId,
  entryPoint = false,
  answerKey,
  locale,
  answers = {},
  onAnswerChange,
  onNavigateToFlowchart,
  data: legacyData,
  navigate,
}: NavigationChartProps) {
  // Legacy mode: data prop passed directly (no DB)
  if (legacyData) {
    return <LegacyNavigationChart data={legacyData} navigate={navigate} />;
  }

  if (!locale || !onAnswerChange || !onNavigateToFlowchart) return null;

  if (entryPoint) {
    return (
      <NavigationChartEntryPointDB
        answerKey={answerKey ?? "entry-point"}
        locale={locale}
        answers={answers}
        onAnswerChange={onAnswerChange}
        onNavigateToFlowchart={onNavigateToFlowchart}
      />
    );
  }

  if (!flowchartId) return null;

  return (
    <NavigationChartByIdDB
      flowchartId={flowchartId}
      answerKey={answerKey ?? flowchartId}
      locale={locale}
      answers={answers}
      onAnswerChange={onAnswerChange}
      onNavigateToFlowchart={onNavigateToFlowchart}
    />
  );
}

/**
 * Fetches the entry-point flowchart (isEntryPoint = true) and renders it.
 * Also fetches display names for any linked flowcharts referenced by options.
 */
function NavigationChartEntryPointDB({
  answerKey,
  locale,
  answers,
  onAnswerChange,
  onNavigateToFlowchart,
}: {
  answerKey: string;
  locale: Locale;
  answers: FlowchartAnswers;
  onAnswerChange: (
    answerKey: string,
    stepId: string,
    optionId: string,
    clearStepIds?: string[],
  ) => void;
  onNavigateToFlowchart: (flowchartId: string) => void;
}) {
  const { data } = useQuery(getNavigationEntryPointQueryOptions(locale));

  const linkedIds = data
    ? [
        ...new Set(
          data.data.steps
            .flatMap((s) => s.options)
            .map((o) => o.linkedFlowchartId)
            .filter((id): id is string => !!id),
        ),
      ]
    : [];

  const { data: namesMap = {} } = useQuery(
    getNavigationFlowchartNamesQueryOptions(linkedIds),
  );

  const linkedFlowchartNames: Record<string, string> = {};
  for (const [id, names] of Object.entries(namesMap)) {
    linkedFlowchartNames[id] = locale === "ja" ? names.nameJa : names.nameEn;
  }

  if (!data) return null;

  return (
    <NavigationChartInner
      flowchartId={data.id}
      slug={answerKey}
      data={data.data}
      locale={locale}
      answers={answers}
      linkedFlowchartNames={linkedFlowchartNames}
      onAnswerChange={onAnswerChange}
      onNavigateToFlowchart={onNavigateToFlowchart}
    />
  );
}

/**
 * Fetches a flowchart by UUID and renders it via NavigationChartInner.
 * Uses `answerKey` as the answers namespace key (UUID for linked flowcharts).
 */
function NavigationChartByIdDB({
  flowchartId,
  answerKey,
  locale,
  answers,
  onAnswerChange,
  onNavigateToFlowchart,
}: {
  flowchartId: string;
  answerKey: string;
  locale: Locale;
  answers: FlowchartAnswers;
  onAnswerChange: (
    answerKey: string,
    stepId: string,
    optionId: string,
    clearStepIds?: string[],
  ) => void;
  onNavigateToFlowchart: (flowchartId: string) => void;
}) {
  const { data } = useQuery(
    getNavigationFlowchartByIdQueryOptions(flowchartId, locale),
  );

  const linkedIds = data
    ? [
        ...new Set(
          data.data.steps
            .flatMap((s) => s.options)
            .map((o) => o.linkedFlowchartId)
            .filter((id): id is string => !!id),
        ),
      ]
    : [];

  const { data: namesMap = {} } = useQuery(
    getNavigationFlowchartNamesQueryOptions(linkedIds),
  );

  const linkedFlowchartNames: Record<string, string> = {};
  for (const [id, names] of Object.entries(namesMap)) {
    linkedFlowchartNames[id] = locale === "ja" ? names.nameJa : names.nameEn;
  }

  if (!data) return null;

  return (
    <NavigationChartInner
      flowchartId={data.id}
      slug={answerKey}
      data={data.data}
      locale={locale}
      answers={answers}
      linkedFlowchartNames={linkedFlowchartNames}
      onAnswerChange={onAnswerChange}
      onNavigateToFlowchart={onNavigateToFlowchart}
    />
  );
}

/**
 * Backward-compatible adapter for routes that still pass the old static
 * `NavigationData` shape. Converts to the new step/option schema and renders
 * inline without any DB queries.
 */
function LegacyNavigationChart({
  data,
  navigate,
}: {
  data: NavigationData;
  navigate?: (options: { to: string }) => void;
}) {
  const [enabledStepIndex, setEnabledStepIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<number, string>
  >({});

  // Convert legacy steps to new shape for rendering
  const newSteps: NavigationFlowchartStep[] = data.steps.map((s) => ({
    id: s.id,
    title: { en: s.title, ja: s.title },
    text: { en: s.text, ja: s.text },
    options: s.options.map((o) => ({
      id: o.id,
      title: { en: o.title, ja: o.title },
      nextStep: o.nextStep,
      link: o.link,
      ...(o.linkText ? { linkText: { en: o.linkText, ja: o.linkText } } : {}),
    })),
  }));

  const handleOptionClick = (
    option: NavigationFlowchartOption,
    stepIndex: number,
  ) => {
    if (
      stepIndex > enabledStepIndex ||
      selectedOptions[stepIndex] === option.id
    )
      return;
    if (option.link && !option.link.startsWith("http")) {
      navigate?.({ to: option.link });
      return;
    }
    if (option.nextStep) {
      setSelectedOptions((prev) => ({ ...prev, [stepIndex]: option.id }));
      setEnabledStepIndex(stepIndex + 1);
    }
  };

  return (
    <div className="relative my-8 flex min-w-5xl flex-col items-center gap-8">
      {newSteps.map((step, index) => {
        const isEnabled = index <= enabledStepIndex;
        return (
          <div
            key={step.id}
            className={cn(
              "transition-opacity duration-300",
              isEnabled ? "opacity-100" : "opacity-30",
            )}
          >
            <StepComponent
              step={step}
              stepIndex={index}
              allSteps={newSteps}
              linkedFlowchartNames={{}}
              onOptionClick={handleOptionClick}
              isEnabled={isEnabled}
              selectedOptionId={selectedOptions[index]}
            />
          </div>
        );
      })}
    </div>
  );
}

export { NavigationChart, Breadcrumbs, NavigationChartInner };
export type { BreadcrumbItem };
