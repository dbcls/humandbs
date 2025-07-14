import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  title: string;
  nextStep?: string;
  link?: string;
  linkText?: string;
}

interface Step {
  id: string;
  title: string;
  text: string;
  options: Option[];
}

interface NavigationData {
  steps: Step[];
}

interface NavigationChartProps {
  data: NavigationData;
  navigate?: (options: { to: string }) => void;
}

const OptionComponent = ({
  option,
  onOptionClick,
  isEnabled = true,
  isSelected = false,
}: {
  option: Option;
  onOptionClick: () => void;
  isEnabled?: boolean;
  isSelected?: boolean;
}) => {
  const optionBaseClasses =
    "border-tetriary w-full rounded-xl border-3 bg-white p-3 font-bold transition-colors text-3xl";

  if (option.link) {
    const linkText = option.linkText || option.link;
    const isExternal = option.link.startsWith("http");

    return (
      <div
        className={cn(optionBaseClasses, "flex flex-col items-center gap-2", {
          "pointer-events-none cursor-not-allowed": !isEnabled || isSelected,
        })}
        data-option-id={option.id}
      >
        {option.title}
        {isExternal ? (
          <a
            href={option.link}
            target="_blank"
            rel="noopener noreferrer"
            className="from-accent to-accent-light inline-block rounded bg-gradient-to-r px-8 py-1 text-sm text-white"
          >
            {linkText} →
          </a>
        ) : (
          <Button
            onClick={onOptionClick}
            className="px-8 text-sm"
            size="slim"
            disabled={!isEnabled || isSelected}
          >
            {linkText} →
          </Button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onOptionClick}
      disabled={!isEnabled || isSelected}
      className={cn(optionBaseClasses, {
        "pointer-events-none cursor-not-allowed": !isEnabled || isSelected,
        "hover:bg-tetriary cursor-pointer hover:text-white":
          isEnabled && !isSelected,
      })}
      data-option-id={option.id}
    >
      {option.title}
    </button>
  );
};

const StepComponent = ({
  step,
  stepIndex,
  onOptionClick,
  stepRef,
  innerRef,
  isEnabled = true,
  selectedOptionId,
}: {
  step: Step;
  stepIndex: number;
  onOptionClick: (option: Option, stepIndex: number) => void;
  stepRef: (el: HTMLDivElement | null) => void;
  innerRef: (el: HTMLDivElement | null) => void;
  isEnabled?: boolean;
  selectedOptionId?: string;
}) => (
  <div className="relative" ref={stepRef}>
    <div className="bg-primary rounded-xl px-16 py-7" ref={innerRef}>
      <h2 className="text-secondary mb-2 text-center text-4xl font-bold">
        {step.title}
      </h2>
      <p className="m-auto mb-5 max-w-3/5 text-center">{step.text}</p>
      <div className="text-tetriary flex justify-center gap-8">
        {step.options.map((option) => (
          <div
            key={option.id}
            className="relative w-[25vw] max-w-xl min-w-sm text-center"
          >
            <OptionComponent
              option={option}
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

const Arrow = ({
  option,
  stepIndex,
  selectedOptions,
  stepRefs,
  containerRect,
}: {
  option: Option;
  stepIndex: number;
  selectedOptions: Record<number, string>;
  stepRefs: React.RefObject<
    {
      step: HTMLDivElement | null;
      inner: HTMLDivElement | null;
    }[]
  >;
  containerRect: DOMRect;
}) => {
  const currentStepElements = stepRefs.current[stepIndex];
  const nextStepElements = stepRefs.current[stepIndex + 1];
  const isSelected = selectedOptions[stepIndex] === option.id;

  if (!currentStepElements?.step || !nextStepElements?.inner) return null;

  const optionElement = currentStepElements.step.querySelector(
    `[data-option-id="${option.id}"]`
  );

  if (!optionElement) return null;

  const nextStepRect = nextStepElements.inner.getBoundingClientRect();
  const optionRect = optionElement.getBoundingClientRect();
  const height = nextStepRect.top - optionRect.bottom;

  if (height <= 0) return null;

  return (
    <div
      className={cn(
        "absolute z-10 flex flex-col items-center transition-opacity duration-300",
        isSelected ? "opacity-100" : "opacity-30"
      )}
      style={{
        top: `${optionRect.bottom - containerRect.top}px`,
        left: `${optionRect.left + optionRect.width / 2 - containerRect.left}px`,
        transform: "translateX(-50%)",
      }}
    >
      <div
        className="bg-tetriary w-[3px]"
        style={{ height: `${height - 14}px` }}
      />
      <div className="border-t-tetriary h-0 w-0 border-t-8 border-r-8 border-l-8 border-r-transparent border-l-transparent" />
    </div>
  );
};

function NavigationChart({ data, navigate }: NavigationChartProps) {
  const [enabledStepIndex, setEnabledStepIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<number, string>
  >({});
  const [_, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const stepRefs = useRef<
    { step: HTMLDivElement | null; inner: HTMLDivElement | null }[]
  >([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleOptionClick = (option: Option, stepIndex: number) => {
    if (
      stepIndex > enabledStepIndex ||
      selectedOptions[stepIndex] === option.id
    ) {
      return;
    }

    if (option.link && !option.link.startsWith("http")) {
      navigate?.({ to: option.link });
      return;
    }

    if (option.nextStep) {
      setSelectedOptions((prev) => ({ ...prev, [stepIndex]: option.id }));
      setEnabledStepIndex(stepIndex + 1);
    }
  };

  const renderArrows = useCallback(() => {
    if (!containerRef.current) return null;
    const containerRect = containerRef.current.getBoundingClientRect();

    return data.steps.slice(0, -1).map((step, index) => {
      const nextStepId = data.steps[index + 1]?.id;
      return step.options
        .filter((option) => option.nextStep === nextStepId)
        .map((option) => (
          <Arrow
            key={`${index}-${option.id}`}
            option={option}
            stepIndex={index}
            selectedOptions={selectedOptions}
            stepRefs={stepRefs}
            containerRect={containerRect}
          />
        ));
    });
  }, [data.steps, selectedOptions]);

  return (
    <div
      className="relative my-8 flex min-w-5xl flex-col items-center gap-8"
      ref={containerRef}
    >
      {data.steps.map((step, index) => {
        const isEnabled = index <= enabledStepIndex;

        return (
          <div
            key={step.id}
            className={cn(
              "transition-opacity duration-300",
              isEnabled ? "opacity-100" : "opacity-30"
            )}
          >
            <StepComponent
              step={step}
              stepIndex={index}
              onOptionClick={handleOptionClick}
              stepRef={(el) => {
                stepRefs.current[index] = {
                  ...stepRefs.current[index],
                  step: el,
                };
              }}
              innerRef={(el) => {
                stepRefs.current[index] = {
                  ...stepRefs.current[index],
                  inner: el,
                };
              }}
              isEnabled={isEnabled}
              selectedOptionId={selectedOptions[index]}
            />
          </div>
        );
      })}
      {renderArrows()}
    </div>
  );
}

export { NavigationChart };
