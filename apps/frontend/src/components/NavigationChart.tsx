import { useState, useRef, useEffect } from "react";
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

export interface NavigationData {
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
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [buttonHeight, setButtonHeight] = useState<number>(0);

  function updateHeight() {
    if (buttonRef.current) {
      setButtonHeight(buttonRef.current.offsetHeight);
    }
  }

  useEffect(() => {
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [option.title]);

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
            className="px-8 text-sm disabled:opacity-100"
            size="slim"
            disabled={!isEnabled || isSelected}
          >
            {linkText} →
          </Button>
        )}
      </div>
    );
  }

  const arrow = (
    // Add arrow with a height of: (Largest Option div height (100%) - Button height) (Equals the distance until start of padding) + arbitrary value (roughly padding + gap/2)
    <div
      className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center"
      style={{ height: `calc(100% - ${buttonHeight}px + 32px)` }}
    >
      <div className="bg-tetriary h-full w-[3px]" />
      <div className="border-t-tetriary h-0 w-0 border-t-8 border-r-8 border-l-8 border-r-transparent border-l-transparent" />
    </div>
  );

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
        {option.title}
      </button>
      {arrow}
    </div>
  );
};

const StepComponent = ({
  step,
  stepIndex,
  onOptionClick,
  isEnabled = true,
  selectedOptionId,
}: {
  step: Step;
  stepIndex: number;
  onOptionClick: (option: Option, stepIndex: number) => void;
  isEnabled?: boolean;
  selectedOptionId?: string;
}) => (
  <div className="relative">
    <div className="bg-primary rounded-xl px-16 py-7">
      <h2 className="text-secondary mb-2 text-center text-4xl font-bold">
        {step.title}
      </h2>
      <p className="m-auto mb-5 w-2/3 max-w-3xl">{step.text}</p>
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

function NavigationChart({ data, navigate }: NavigationChartProps) {
  const [enabledStepIndex, setEnabledStepIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<number, string>
  >({});

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

  return (
    <div className="relative my-8 flex min-w-5xl flex-col items-center gap-8">
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
              isEnabled={isEnabled}
              selectedOptionId={selectedOptions[index]}
            />
          </div>
        );
      })}
    </div>
  );
}

export { NavigationChart };
