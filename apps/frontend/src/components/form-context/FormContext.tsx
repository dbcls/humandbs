import { createFormHookContexts, createFormHook } from "@tanstack/react-form";
import { lazy } from "react";
import TextField from "./TextField";
import CheckboxField from "./CheckboxField";
import SwitchField from "./SwitchField";
import UpdateButton from "./UpdateButton";

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

const ContentAreaField = lazy(() => import("./ContentAreaField"));
const DateField = lazy(() => import("./DateField"));
const DateRangeField = lazy(() => import("./DateRangeField"));

export const { useAppForm } = createFormHook({
  fieldContext,
  formContext,

  fieldComponents: {
    TextField,
    ContentAreaField,
    CheckboxField,
    DateField,
    DateRangeField,
    SwitchField,
  },
  formComponents: {
    UpdateButton,
  },
});
