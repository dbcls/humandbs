export interface NavigationFlowchartOption {
  id: string;
  titleEn: string;
  titleJa: string;
  nextStep?: string;
  linkedFlowchartId?: string;
  link?: string;
  linkTextEn?: string;
  linkTextJa?: string;
}

export interface NavigationFlowchartStep {
  id: string;
  titleEn: string;
  titleJa: string;
  textEn: string;
  textJa: string;
  options: NavigationFlowchartOption[];
}

export interface NavigationFlowchartData {
  steps: NavigationFlowchartStep[];
}

export interface NavigationFlowchartConfig {
  en: NavigationFlowchartData;
  ja: NavigationFlowchartData;
}
