import { createFormHook, createFormHookContexts } from "@tanstack/react-form";

import { lazy } from "react";

import CheckboxField from "./CheckboxField";
import BilingualTextField from "./research-fields/BilingualTextField";
import BilingualTextValueField from "./research-fields/BilingualTextValueField";
import BilingualURLArrayField from "./research-fields/BilingualURLArrayField";
import SelectField from "./SelectField";
import TextField from "./TextField";

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();

const ContentAreaField = lazy(() => import("./ContentAreaField"));
const DateField = lazy(() => import("./DateField"));
const DateRangeField = lazy(() => import("./DateRangeField"));
const DateTimeField = lazy(() => import("./DateTimeField"));

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,

  fieldComponents: {
    TextField,
    ContentAreaField,
    CheckboxField,
    DateField,
    DateRangeField,
    DateTimeField,
    SelectField,
    BilingualTextField,
    BilingualTextValueField,
    BilingualURLArrayField,
  },
  formComponents: {},
});
