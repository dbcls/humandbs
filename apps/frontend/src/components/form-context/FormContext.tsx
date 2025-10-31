import { createFormHookContexts, createFormHook } from "@tanstack/react-form";
import { lazy } from "react";
import TextField from "./TextField";
import CheckboxField from "./CheckboxField";
import SwitchField from "./SwitchField";
import UpdateButton from "./UpdateButton";
import LocaleSwitchField from "./LocaleSwitchField";
import TextAreaField from "./TextAreaField";
import SelectField from "./SelectField";

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
  },
  formComponents: {
    UpdateButton,
  },
});
