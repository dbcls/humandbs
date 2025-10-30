import type { Address } from "@humandbs/backend/types";
import { withFieldGroup } from "./FormContext";
import { Label } from "../ui/label";

const addressDefaultValues: Address = {
  country: "",
  state: "",
  city: "",
  street: "",
  postalCode: "",
};

export const AddressForm = withFieldGroup({
  defaultValues: addressDefaultValues,
  props: {
    title: "Address",
  },
  render: function Render({ title, group }) {
    return (
      <div className="flex flex-col gap-5">
        <Label>{title}</Label>

        <section className="nested-form flex flex-col gap-4">
          <group.AppField name="country">
            {(field) => <field.TextField label="Country" />}
          </group.AppField>

          <div className="flex gap-3">
            <group.AppField name="state">
              {(field) => <field.TextField label="State" type="col" />}
            </group.AppField>
            <group.AppField name="city">
              {(field) => <field.TextField label="City" type="col" />}
            </group.AppField>
            <group.AppField name="postalCode">
              {(field) => <field.TextField label="Postal code" type="col" />}
            </group.AppField>
          </div>
          <group.AppField name="street">
            {(field) => <field.TextField label="Street" type="col" />}
          </group.AppField>
        </section>
      </div>
    );
  },
});
