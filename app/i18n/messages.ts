/**
 * The words the interface itself says.
 *
 * No library. The languages are two and fixed, the only authors are developers,
 * and most of what a reader sees is content rather than interface text — so
 * what a library would carry (key management, plural rules, a translation
 * service) does not apply here. Holding the dictionary as a value instead means
 * a mistyped key and a missing translation are both compile errors.
 *
 * **Japanese is the shape.** `Messages` is derived from it, so English is
 * checked against it: a key added here without an English counterpart does not
 * build, and neither does a key that exists only in English.
 *
 * **Domain words are not decided here.** Their translations live in
 * `docs/glossary.md`, because the same word appears in a heading, in an API
 * value, in a facet label and in a vocabulary label. This file follows it.
 */

import type { Locale } from "./locale"

const ja = {
  siteName: "NBDC ヒトデータベース",
  skipToContent: "本文へ",
  otherLanguage: "English",
  notFoundTitle: "ページが見つかりません",
  notFoundBody: "お探しのページは存在しないか、公開されていません。",
  notApplicable: "該当なし",
  untranslatedNotice: "このページには未翻訳の項目があります。もう一方の言語の内容を表示しています。",
  research: {
    researchId: "研究 ID",
    title: "研究題目",
    overview: "研究概要",
    aims: "目的",
    methods: "研究方法",
    targets: "対象",
    url: "URL",
    datasets: "データセット一覧",
    dataProvider: "提供者情報",
    representative: "代表者",
    organization: "所属機関",
    researchProjects: "研究プロジェクト情報",
    researchProjectName: "研究プロジェクト名",
    grants: "助成金情報",
    grantTitle: "研究課題名",
    grantAgency: "科研費・助成金名",
    grantId: "研究課題番号",
    relatedPublications: "関連論文",
    publicationTitle: "タイトル",
    controlledAccessUsers: "制限公開データの利用者一覧",
    country: "国",
    periodOfDataUse: "データ利用期間",
    releaseInfo: "リリース情報",
    latestVersion: "最新",
    toLatestVersion: "最新バージョンへ",
    releaseNote: "リリースノート",
    datasetsAddedInRelease: "このリリースで追加されたデータセット",
    noDatasetsAddedInRelease: "このリリースで追加されたデータセットはありません。",
    noDatasets: "公開されているデータセットはありません。",
  },
  dataset: {
    datasetId: "データセット ID",
    datasets: "データセット",
    research: "研究",
    datePublished: "公開日",
    dateModified: "更新日",
    typeOfData: "データの種類",
    accessType: "アクセス制限",
    experiments: "解析手法",
    noExperiments: "解析手法の記載はありません。",
  },
}

export type Messages = typeof ja

const en: Messages = {
  siteName: "NBDC Human Database",
  skipToContent: "Skip to content",
  otherLanguage: "日本語",
  notFoundTitle: "Page not found",
  notFoundBody: "This page does not exist, or it is not published.",
  notApplicable: "Not applicable",
  untranslatedNotice: "Some items on this page are untranslated. The other language is shown instead.",
  research: {
    researchId: "Research ID",
    title: "Title",
    overview: "Research overview",
    aims: "Aims",
    methods: "Methods",
    targets: "Targets",
    url: "URL",
    datasets: "Datasets",
    dataProvider: "Data provider",
    representative: "Representative",
    organization: "Organization",
    researchProjects: "Research projects",
    researchProjectName: "Name",
    grants: "Grants",
    grantTitle: "Title",
    grantAgency: "Name",
    grantId: "Project number",
    relatedPublications: "Related publications",
    publicationTitle: "Title",
    controlledAccessUsers: "Controlled access users",
    country: "Country",
    periodOfDataUse: "Period of data use",
    releaseInfo: "Release info",
    latestVersion: "Latest",
    toLatestVersion: "To the latest version",
    releaseNote: "Release note",
    datasetsAddedInRelease: "Datasets added in this release",
    noDatasetsAddedInRelease: "No datasets added in this release.",
    noDatasets: "This version lists no published datasets.",
  },
  dataset: {
    datasetId: "Dataset ID",
    datasets: "Datasets",
    research: "Research",
    datePublished: "Date published",
    dateModified: "Date modified",
    typeOfData: "Type of data",
    accessType: "Access type",
    experiments: "Analysis method",
    noExperiments: "No analysis method is described.",
  },
}

const MESSAGES: Record<Locale, Messages> = { ja, en }

export function messagesFor(locale: Locale): Messages {
  return MESSAGES[locale]
}
