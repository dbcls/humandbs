import type { Address } from "@humandbs/backend/types";

import { Label } from "../ui/label";

import { withFieldGroup } from "./FormContext";

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
              {(field) => (
                <field.TextField className="flex-1" label="State" type="col" />
              )}
            </group.AppField>
            <group.AppField name="city">
              {(field) => (
                <field.TextField className="flex-1" label="City" type="col" />
              )}
            </group.AppField>
            <group.AppField name="postalCode">
              {(field) => (
                <field.TextField
                  className="flex-1"
                  label="Postal code"
                  type="col"
                />
              )}
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
