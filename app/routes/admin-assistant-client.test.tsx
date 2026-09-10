import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { messagesFor } from "~/i18n/messages"

import {
  AssistantReport,
  assistantLoginPath,
  assistantResponseJson,
  datasetIds,
  Datasets,
  LatestDetailRequests,
  PersonReport,
  type AssessmentData,
} from "./admin-assistant-client"

const words = messagesFor("ja").admin.assistant

const person = {
  name_jp: "山田 太郎",
  organization_jp: "テスト大学",
  email: "taro@example.ac.jp",
  phone: "03-1234-5678",
  address: "東京都千代田区",
}

describe("アシスタントの人物検証表示", () => {
  it("法人格の根拠を単一の参考 URL ラベルでドメイン表示する", () => {
    const html = renderToStaticMarkup(
      <PersonReport
        title={words.researcher}
        validation={{
          person,
          verification: {
            organization_legal_entity_type: "国立大学法人",
            organization_legal_entity_urls: [
              "https://example.ac.jp/about",
              "https://registry.example.go.jp/entities/1",
            ],
          },
        }}
        words={words}
      />,
    )

    expect(html.match(/参考URL/g)).toHaveLength(1)
    expect(html).toMatch(/>example\.ac\.jp<\/a><\/span><span>, <a/)
    expect(html).toContain(">registry.example.go.jp</a>")
  })

  it("正規化後の電話番号が元の番号と同じなら重複表示しない", () => {
    const html = renderToStaticMarkup(
      <PersonReport
        title={words.researcher}
        validation={{
          person,
          verification: {
            phone_validation_result: {
              corrected_phone_number: person.phone,
            },
          },
        }}
        words={words}
      />,
    )

    expect(html).not.toContain(words.normalizedPhone)
  })

  it("正規化によって電話番号が変わった場合は正規化後も表示する", () => {
    const html = renderToStaticMarkup(
      <PersonReport
        title={words.researcher}
        validation={{
          person,
          verification: {
            phone_validation_result: {
              corrected_phone_number: "+81 3-1234-5678",
            },
          },
        }}
        words={words}
      />,
    )

    expect(html).toContain(words.normalizedPhone)
    expect(html).toContain("+81 3-1234-5678")
  })

  it("所属機関長には住所と住所検証を表示しない", () => {
    const html = renderToStaticMarkup(
      <PersonReport
        title={words.institutionHead}
        validation={{
          person,
          verification: {
            address_validation_result: {
              address_exists: true,
              formatted_address: person.address,
            },
          },
        }}
        isInstitutionHead
        words={words}
      />,
    )

    expect(html).not.toContain(words.address)
    expect(html).not.toContain(person.address)
    expect(html).not.toContain(words.addressVerification)
  })

  it("所属機関長の役職検証を役職の直後、所属の前に表示する", () => {
    const html = renderToStaticMarkup(
      <PersonReport
        title={words.institutionHead}
        validation={{ person, verification: undefined }}
        positionVerification={{
          position_verified: true,
          position_message: "役職を確認しました",
        }}
        isInstitutionHead
        words={words}
      />,
    )

    const position = html.indexOf(`>${words.position}</dt>`)
    const positionVerification = html.indexOf(words.headPositionVerification)
    const organization = html.indexOf(`>${words.organization}</dt>`)

    expect(position).toBeGreaterThanOrEqual(0)
    expect(position).toBeLessThan(positionVerification)
    expect(positionVerification).toBeLessThan(organization)
  })

  it("メール整合性の名称はドメインを対象とする", () => {
    expect(words.emailConsistency).toBe("メールドメインの整合性")
  })

  it("所属・メール・電話・住所の直後に関連する検証結果をまとめて表示する", () => {
    const html = renderToStaticMarkup(
      <PersonReport
        title={words.researcher}
        validation={{
          person,
          verification: {
            organization_legal_entity_type: "国立大学法人",
            researcher_profile_url: "https://example.ac.jp/profile",
            mx_domain_verified: true,
            organization_domain_verified: true,
            researcher_email_verified: false,
            phone_validation_result: {
              country_code_matched_with_address: true,
            },
            address_validation_result: {
              address_exists: true,
              organization_match: "一致",
            },
          },
        }}
        words={words}
      />,
    )

    const organization = html.indexOf(`>${words.organization}</dt>`)
    const legalEntity = html.indexOf(words.legalEntity, organization)
    const profile = html.indexOf(words.profile, legalEntity)
    const email = html.indexOf(`>${words.email}</dt>`, profile)
    const emailVerification = html.indexOf(words.emailVerification, email)
    const mxVerification = html.indexOf(words.mxVerification, emailVerification)
    const organizationDomain = html.indexOf(words.organizationDomain, mxVerification)
    const supplementary = html.indexOf(
      words.supplementaryEmailVerification,
      organizationDomain,
    )
    const phone = html.indexOf(`>${words.phone}</dt>`, supplementary)
    const phoneVerification = html.indexOf(words.phoneVerification, phone)
    const address = html.indexOf(`>${words.address}</dt>`, phoneVerification)
    const addressVerification = html.indexOf(words.addressVerification, address)

    expect([
      organization,
      legalEntity,
      profile,
      email,
      emailVerification,
      mxVerification,
      organizationDomain,
      supplementary,
      phone,
      phoneVerification,
      address,
      addressVerification,
    ]).toEqual([...[
      organization,
      legalEntity,
      profile,
      email,
      emailVerification,
      mxVerification,
      organizationDomain,
      supplementary,
      phone,
      phoneVerification,
      address,
      addressVerification,
    ]].sort((left, right) => left - right))
    expect(html.match(/ml-4 border-line border-l pl-3/g)).toHaveLength(4)
  })

  it("肯定判定を緑、否定判定を赤で表示する", () => {
    const html = renderToStaticMarkup(
      <PersonReport
        title={words.researcher}
        validation={{
          person,
          verification: {
            mx_domain_verified: true,
            organization_domain_verified: false,
            address_validation_result: {
              address_exists: true,
              organization_match: "不一致",
            },
          },
        }}
        words={words}
      />,
    )

    expect(html).toContain("class=\"text-green-700\">確認済み</span>")
    expect(html).toContain("class=\"text-danger\">未確認</span>")
    expect(html).toContain("class=\"text-danger\">不一致</span>")
  })

  it("否定文に含まれる「一致」を肯定判定として扱わない", () => {
    const html = renderToStaticMarkup(
      <PersonReport
        title={words.institutionHead}
        validation={{ person, verification: undefined }}
        positionVerification={{
          position_verified: false,
          position_message: "申請書の氏名と現在の役職者が一致しません",
        }}
        isInstitutionHead
        words={words}
      />,
    )

    expect(html).toContain(
      "class=\"text-danger\">申請書の氏名と現在の役職者が一致しません</span>",
    )
  })
})

function renderReport(report: AssessmentData) {
  return renderToStaticMarkup(
    <AssistantReport
      report={report}
      words={words}
      applicationType="利用申請"
      busy={false}
      onAddDatasets={() => Promise.resolve(true)}
      onRemoveDataset={() => undefined}
    />,
  )
}

describe("アシスタントレポートのレイアウト", () => {
  it("研究代表者、申請者、所属機関長を縦に並ぶ全幅パネルで表示する", () => {
    const html = renderReport({
      researcher_info: person,
      submitter_info: { ...person, email: "submitter@example.ac.jp" },
      head_of_institution_info: { ...person, email: "head@example.ac.jp" },
    })
    const panel = (label: string) =>
      html.indexOf(`role="group" aria-label="${label}"`)

    expect(panel(words.researcher)).toBeGreaterThanOrEqual(0)
    expect(panel(words.submitter)).toBeGreaterThan(panel(words.researcher))
    expect(panel(words.institutionHead)).toBeGreaterThan(panel(words.submitter))
    expect(html).not.toContain("lg:grid-cols-3")
  })

  it("整合性の肯定・否定判定を色分けする", () => {
    const html = renderReport({
      phone_consistency_result: {
        all_match: false,
        summary: "NG",
        details: [
          "研究代表者 ↔ 申請者: 完全一致",
          "研究代表者 ↔ 所属機関長: 市外局番一致（03）",
          "申請者 ↔ 所属機関長: 不一致",
        ],
      },
    })

    expect(html).toContain("class=\"text-green-700\">完全一致</span>")
    expect(html).toContain("class=\"text-green-700\">市外局番一致（03）</span>")
    expect(html).toContain("class=\"text-danger\">不一致</span>")
    expect(html).toContain("class=\"text-danger\">NG</span>")
  })

  it("データセットごとの制限事項を詳細内で個別に表示する", () => {
    const html = renderReport({
      dataset_analysis_list: [
        { id: "JGAD000001", found_in_database: true },
        { id: "JGAD000002", found_in_database: true },
      ],
      dataset_policy_groups: [
        { dataset_ids: ["JGAD000001"], policy_text: "データセット 1 の制限" },
        { dataset_ids: ["JGAD000002"], policy_text: "データセット 2 の制限" },
      ],
    })

    expect(html).toMatch(/データセット ID: JGAD000001.*データセット 1 の制限/)
    expect(html).toMatch(/データセット ID: JGAD000002.*データセット 2 の制限/)
    expect(html).not.toContain("href=\"/policy-companylimitation\"")
  })

  it("解析手法と ICD10 の詳細をレポートと同じ比較順で表示する", () => {
    const html = renderReport({
      application_analysis_method: "申請手法",
      paper_analysis_method_list: ["論文手法"],
      abstract_icd10_list: ["A01"],
      papers: [{ title: "論文", icd10_code_list: ["B02"] }],
      dataset_analysis_list: [{
        id: "JGAD000001",
        found_in_database: true,
        analysis_method_list: ["データセット手法"],
        analysis_method_similarity: "一致",
        analysis_method_similarity_reason: "理由",
        paper_similarity: "不一致",
        paper_similarity_reason: "論文の理由",
        icd10_code_list: ["C03"],
        purpose_similarity_icd10: ["一致"],
        paper_similarity_icd10: ["不一致"],
      }],
    })

    expect(html).toMatch(/解析手法.*データセット.*データセット手法.*申請された研究.*申請手法.*判定.*一致 理由.*発表済み論文.*論文手法.*判定.*不一致 論文の理由/)
    expect(html).toMatch(/ICD10.*データセット.*C03.*申請された研究.*A01.*判定.*一致.*発表済み論文.*B02.*判定.*不一致/)
  })
})

describe("アシスタント API のセッション切れ", () => {
  it("リダイレクト応答は安全なログイン経路へ倒す", async () => {
    const response = new Response("{}", {
      headers: { "content-type": "application/json" },
    })
    Object.defineProperty(response, "redirected", { value: true })
    const signIn = vi.fn()

    await expect(
      assistantResponseJson(response, words.loadFailed, signIn),
    ).rejects.toThrow(words.loadFailed)
    expect(signIn).toHaveBeenCalledOnce()
    expect(
      assistantLoginPath("/en/admin/assistant", "?view=processing"),
    ).toBe(
      "/auth/login?redirect=%2Fen%2Fadmin%2Fassistant%3Fview%3Dprocessing",
    )
  })

  it("JSON を期待する要求の非 JSON 応答もログインへ倒す", async () => {
    const signIn = vi.fn()
    const response = new Response("<!doctype html><title>Sign in</title>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    })

    await expect(
      assistantResponseJson(response, words.loadFailed, signIn),
    ).rejects.toThrow(words.loadFailed)
    expect(signIn).toHaveBeenCalledOnce()
  })
})

describe("アシスタント詳細の要求順", () => {
  it("選択後に古い選択とそのポーリングが完了しても最新詳細を保つ", async () => {
    const requests = new LatestDetailRequests()
    let resolveFirst!: (value: string) => void
    let resolveSecond!: (value: string) => void
    let resolveFirstPoll!: (value: string) => void
    const first = requests.run(
      "first",
      true,
      () => new Promise<string>((resolve) => { resolveFirst = resolve }),
    )
    const second = requests.run(
      "second",
      true,
      () => new Promise<string>((resolve) => { resolveSecond = resolve }),
    )
    const firstPoll = requests.run(
      "first",
      false,
      () => new Promise<string>((resolve) => { resolveFirstPoll = resolve }),
    )

    resolveSecond("second detail")
    await expect(second).resolves.toBe("second detail")
    resolveFirstPoll("first poll detail")
    resolveFirst("first detail")
    await expect(firstPoll).resolves.toBeUndefined()
    await expect(first).resolves.toBeUndefined()
    expect(requests.selected()).toBe("second")
  })
})

function renderDatasets(canManage: boolean): string {
  return renderToStaticMarkup(
    <Datasets
      datasets={[{ id: "JGAD000001", found_in_database: false }]}
      requestedDatasets={[]}
      policies={[]}
      applicationMethod=""
      paperMethods={[]}
      abstractIcd10={[]}
      paperIcd10={[]}
      canManage={canManage}
      busy={false}
      onAddDatasets={() => Promise.resolve(true)}
      onRemoveDataset={() => undefined}
      words={words}
    />,
  )
}

describe("アシスタントのデータセット管理", () => {
  it("カンマと空白区切りの ID を空要素・重複なしで解釈する", () => {
    expect(datasetIds(" JGAD000001, JGAD000002\nJGAD000001  ")).toEqual([
      "JGAD000001",
      "JGAD000002",
    ])
    expect(datasetIds(" , \n ")).toEqual([])
  })

  it("利用申請では追加・削除操作を表示する", () => {
    const html = renderDatasets(true)

    expect(html).toContain(words.addDatasets)
    expect(html).toContain(words.removeDataset)
    expect(html).toContain("assistant-dataset-ids")
  })

  it("提供申請ではデータセットを表示しつつ管理操作を隠す", () => {
    const html = renderDatasets(false)

    expect(html).not.toContain(words.addDatasets)
    expect(html).not.toContain(words.removeDataset)
    expect(html).toContain("JGAD000001")
  })
})
