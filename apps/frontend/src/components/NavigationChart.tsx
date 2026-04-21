import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NavigationFlowchartData, NavigationFlowchartOption, NavigationFlowchartStep } from "@/config/navigation-flowchart";
import { getNavigationFlowchartQueryOptions, getNavigationFlowchartByIdQueryOptions } from "@/serverFunctions/navigationFlowchart";
import type { Locale } from "@/config/i18n";

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

// Answers: { [flowchartSlug]: { [stepId]: optionId } }
export type FlowchartAnswers = Record<string, Record<string, string>>;

interface NavigationChartProps {
  // New DB-backed props
  slug?: string;
  locale?: Locale;
  answers?: FlowchartAnswers;
  onAnswerChange?: (slug: string, stepId: string, optionId: string) => void;
  onNavigateToChild?: (childSlug: string) => void;
  // Legacy prop
  data?: NavigationData;
  navigate?: (options: { to: string }) => void;
}

interface BreadcrumbItem {
  slug: string;
  nameEn: string;
  nameJa: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  locale?: Locale;
}

function Breadcrumbs({ items, locale }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  return (
    <nav className="mb-4 flex items-center gap-2 text-sm text-gray-500">
      {items.map((item, i) => (
        <span key={item.slug} className="flex items-center gap-2">
          {i > 0 && <span>›</span>}
          <span>{locale === "ja" ? item.nameJa : item.nameEn}</span>
        </span>
      ))}
    </nav>
  );
}

const OptionComponent = ({
  option,
  locale,
  onOptionClick,
  isEnabled = true,
  isSelected = false,
}: {
  option: NavigationFlowchartOption;
  locale?: Locale;
  onOptionClick: () => void;
  isEnabled?: boolean;
  isSelected?: boolean;
}) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [buttonHeight, setButtonHeight] = useState<number>(0);

  const title = locale === "ja" ? option.titleJa : option.titleEn;
  const linkText = locale === "ja" ? (option.linkTextJa ?? option.linkTextEn) : (option.linkTextEn ?? option.linkTextJa);

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

  // Options with linkedFlowchartId or nextStep show arrow below
  const hasArrow = !!(option.linkedFlowchartId || option.nextStep);

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

const StepComponent = ({
  step,
  stepIndex,
  locale,
  onOptionClick,
  isEnabled = true,
  selectedOptionId,
}: {
  step: NavigationFlowchartStep;
  stepIndex: number;
  locale?: Locale;
  onOptionClick: (option: NavigationFlowchartOption, stepIndex: number) => void;
  isEnabled?: boolean;
  selectedOptionId?: string;
}) => {
  const title = locale === "ja" ? step.titleJa : step.titleEn;
  const text = locale === "ja" ? step.textJa : step.textEn;

  return (
    <div className="relative">
      <div className="bg-primary rounded-xl px-16 py-7">
        <h2 className="text-secondary mb-2 text-center text-4xl font-bold">
          {title}
        </h2>
        <p className="m-auto mb-5 w-2/3 max-w-3xl">{text}</p>
        <div className="text-tetriary flex justify-center gap-8">
          {step.options.map((option) => (
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
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

function NavigationChartInner({
  flowchartId,
  slug,
  data,
  locale,
  answers,
  onAnswerChange,
  onNavigateToChild,
}: {
  flowchartId: string;
  slug: string;
  data: NavigationFlowchartData;
  locale?: Locale;
  answers: FlowchartAnswers;
  onAnswerChange: (slug: string, stepId: string, optionId: string) => void;
  onNavigateToChild: (childSlug: string) => void;
}) {
  const stepAnswers = answers[slug] ?? {};

  // Compute enabled step index from existing answers
  const computeEnabledIndex = () => {
    let idx = 0;
    for (let i = 0; i < data.steps.length; i++) {
      const step = data.steps[i];
      const selectedOptionId = stepAnswers[step.id];
      if (!selectedOptionId) break;
      const option = step.options.find((o) => o.id === selectedOptionId);
      if (option?.nextStep) {
        idx = i + 1;
      }
    }
    return idx;
  };

  const [enabledStepIndex, setEnabledStepIndex] = useState(computeEnabledIndex);

  const handleOptionClick = (option: NavigationFlowchartOption, stepIndex: number) => {
    const step = data.steps[stepIndex];
    if (!step) return;
    if (stepIndex > enabledStepIndex) return;

    onAnswerChange(slug, step.id, option.id);

    if (option.linkedFlowchartId) {
      onNavigateToChild(option.linkedFlowchartId);
      return;
    }

    if (option.nextStep) {
      setEnabledStepIndex(stepIndex + 1);
    }
  };

  return (
    <div className="relative my-8 flex min-w-5xl flex-col items-center gap-8">
      {data.steps.map((step, index) => {
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
              locale={locale}
              onOptionClick={handleOptionClick}
              isEnabled={isEnabled}
              selectedOptionId={stepAnswers[step.id]}
            />
          </div>
        );
      })}
    </div>
  );
}

function NavigationChart({
  slug,
  locale,
  answers = {},
  onAnswerChange,
  onNavigateToChild,
  data: legacyData,
  navigate,
}: NavigationChartProps) {
  // Legacy mode: data prop passed directly (no DB)
  if (legacyData) {
    return <LegacyNavigationChart data={legacyData} navigate={navigate} />;
  }

  if (!slug || !locale || !onAnswerChange || !onNavigateToChild) return null;

  return (
    <NavigationChartDB
      slug={slug}
      locale={locale}
      answers={answers}
      onAnswerChange={onAnswerChange}
      onNavigateToChild={onNavigateToChild}
    />
  );
}

function NavigationChartDB({
  slug,
  locale,
  answers,
  onAnswerChange,
  onNavigateToChild,
}: {
  slug: string;
  locale: Locale;
  answers: FlowchartAnswers;
  onAnswerChange: (slug: string, stepId: string, optionId: string) => void;
  // receives linkedFlowchartId (uuid) — parent resolves to slug
  onNavigateToChild: (childId: string) => void;
}) {
  const { data } = useQuery(getNavigationFlowchartQueryOptions(slug, locale));
  if (!data) return null;

  return (
    <NavigationChartInner
      flowchartId={data.id}
      slug={data.slug}
      data={data.data}
      locale={locale}
      answers={answers}
      onAnswerChange={onAnswerChange}
      onNavigateToChild={onNavigateToChild}
    />
  );
}

// Legacy adapter for routes still using the old NavigationData shape
function LegacyNavigationChart({
  data,
  navigate,
}: {
  data: NavigationData;
  navigate?: (options: { to: string }) => void;
}) {
  const [enabledStepIndex, setEnabledStepIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string>>({});

  // Convert legacy steps to new shape for rendering
  const newSteps: NavigationFlowchartStep[] = data.steps.map((s) => ({
    id: s.id,
    titleEn: s.title,
    titleJa: s.title,
    textEn: s.text,
    textJa: s.text,
    options: s.options.map((o) => ({
      id: o.id,
      titleEn: o.title,
      titleJa: o.title,
      nextStep: o.nextStep,
      link: o.link,
      linkTextEn: o.linkText,
      linkTextJa: o.linkText,
    })),
  }));

  const handleOptionClick = (option: NavigationFlowchartOption, stepIndex: number) => {
    if (stepIndex > enabledStepIndex || selectedOptions[stepIndex] === option.id) return;
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

export { NavigationChart, Breadcrumbs };
export type { BreadcrumbItem };
