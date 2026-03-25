import { createFormHookContexts, createFormHook } from "@tanstack/react-form";
import { lazy } from "react";

import CheckboxField from "./CheckboxField";
import LocaleSwitchField from "./LocaleSwitchField";
import SelectField from "./SelectField";
import SwitchField from "./SwitchField";
import TextAreaField from "./TextAreaField";
import TextField from "./TextField";
import UpdateButton from "./UpdateButton";
import BilingualTextField from "./researchFields/BilingualTextField";
import BilingualTextValueField from "./researchFields/BilingualTextValueField";
import BilingualURLArrayField from "./researchFields/BilingualURLArrayField";

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

const ContentAreaField = lazy(() => import("./ContentAreaField"));
const DateField = lazy(() => import("./DateField"));
const DateRangeField = lazy(() => import("./DateRangeField"));

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,

  fieldComponents: {
    TextField,
    TextAreaField,
    ContentAreaField,
    CheckboxField,
    DateField,
    DateRangeField,
    SwitchField,
    LocaleSwitchField,
    SelectField,
    BilingualTextField,
    BilingualTextValueField,
    BilingualURLArrayField,
  },
  formComponents: {
    UpdateButton,
  },
});
