import { cn } from "@/lib/utils";

import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

import { useFieldContext } from "./FormContext";

export default function SelectField({
  label,
  type = "inline",
  items = [],
}: {
  label?: string;
  type?: "inline" | "col";
  items?: string[] | { label: React.ReactNode; value: string }[];
}) {
  const field = useFieldContext<string>();

  return (
    <Label className={cn({ "flex flex-col items-start": type === "col" })}>
      {label ? <span>{label}</span> : null}
      <Select
        value={field.state.value ?? ""}
        onValueChange={(value) => field.handleChange(value)}
      >
        <SelectTrigger className="w-fit min-w-[180px]">
          <SelectValue placeholder={`Select ${label}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items?.map((item) => {
              const isSimpleItem = typeof item === "string";
              const label = isSimpleItem ? item : item.label;
              const value = isSimpleItem ? item : item.value;
              return (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Label>
  );
}
