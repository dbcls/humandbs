import MDEditor from "@uiw/react-md-editor";
import { Label } from "../ui/label";
import { useFieldContext } from "./FormContext";
import { transformMarkdoc } from "@/markdoc/config";
import { RenderMarkdoc } from "@/markdoc/RenderMarkdoc";

export default function ContentAreaField({ label }: { label: string }) {
  const field = useFieldContext<string>();

  return (
    <div className="flex w-full flex-1 flex-col gap-2 text-sm font-medium">
      <span>{label}</span>
      <div data-color-mode="light" className="flex-1">
        <MDEditor
          highlightEnable={true}
          value={field.state.value ?? ""}
          onChange={(value) => field.handleChange(value || "")}
          height="100%"
          className="md-editor flex-1"
          components={{
            preview: (source) => {
              const { content } = transformMarkdoc({
                rawContent: source,
              });

              return <RenderMarkdoc content={content} />;
            },
          }}
        />
      </div>
    </div>
  );
}
