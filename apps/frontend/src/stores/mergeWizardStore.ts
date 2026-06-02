import { create } from "zustand";

import type { ResearchTemplateData } from "../../../backend/src/api/types/templates";
import type { FieldDecision, MergeFieldDescriptor } from "../routes/{-$lang}/_layout/_authed/admin/researches/-components/utils/computeMergeFields";

interface MergeWizardState {
  fetchedResearch: ResearchTemplateData | null;
  fields: MergeFieldDescriptor[];
  decisions: Record<string, FieldDecision>;
  customValues: Record<string, unknown>;
  activeFieldKey: string | null;
  editing: boolean;
}

interface MergeWizardActions {
  reset: () => void;
  setFetchedResearch: (research: ResearchTemplateData, fields: MergeFieldDescriptor[]) => void;
  setDecision: (key: string, decision: FieldDecision) => void;
  setCustomValue: (key: string, value: unknown) => void;
  clearCustomValue: (key: string) => void;
  setActiveField: (key: string | null) => void;
  setEditing: (editing: boolean) => void;
}

const initialState: MergeWizardState = {
  fetchedResearch: null,
  fields: [],
  decisions: {},
  customValues: {},
  activeFieldKey: null,
  editing: false,
};

const useMergeWizardStore = create<MergeWizardState & MergeWizardActions>((set) => ({
  ...initialState,

  reset: () => set(() => ({ ...initialState })),

  setFetchedResearch: (research, fields) =>
    set(() => ({
      fetchedResearch: research,
      fields,
      decisions: {},
      customValues: {},
      activeFieldKey: null,
      editing: false,
    })),

  setDecision: (key, decision) =>
    set((state) => ({
      decisions: { ...state.decisions, [key]: decision },
    })),

  setCustomValue: (key, value) =>
    set((state) => ({
      customValues: { ...state.customValues, [key]: value },
    })),

  clearCustomValue: (key) =>
    set((state) => {
      const { [key]: _removed, ...rest } = state.customValues;
      return { customValues: rest };
    }),

  setActiveField: (key) => set(() => ({ activeFieldKey: key, editing: false })),

  setEditing: (editing) => set(() => ({ editing })),
}));

export default useMergeWizardStore;
