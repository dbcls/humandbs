export interface LocalizedText {
  en: string;
  ja: string;
}

export interface NavigationFlowchartOption {
  id: string;
  title: LocalizedText;
  description?: LocalizedText;
  nextStep?: string;
  linkedFlowchartId?: string;
  linkedStepId?: string;
  link?: string;
  linkText?: LocalizedText;
}

export interface NavigationFlowchartStep {
  id: string;
  title: LocalizedText;
  text: LocalizedText;
  options: NavigationFlowchartOption[];
}

export interface NavigationFlowchartData {
  steps: NavigationFlowchartStep[];
}

export type NavigationFlowchartConfig = NavigationFlowchartData;
