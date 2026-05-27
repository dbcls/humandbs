import { withForm } from "../FormContext";
import { BilingualTextField } from "./BilingualTextField";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyName = any;

/**
 * Publication card subform.
 *
 * Props:
 * - `baseName`: e.g. "relatedPublication[0]"
 */
export const PublicationField = withForm({
  defaultValues: {} as Record<string, unknown>,
  props: {} as { baseName: string },
  render({ form, baseName }) {
    return (
      <div className="flex flex-col gap-3">
        {/* Title */}
        <BilingualTextField form={form} baseName={`${baseName}.title`} label="Title" />

        {/* DOI */}
        <form.AppField name={`${baseName}.doi` as AnyName}>
          {(f: AnyName) => <f.TextField type="col" label="DOI" />}
        </form.AppField>
      </div>
    );
  },
});
