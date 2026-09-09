import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { messagesFor } from "~/i18n/messages"

import {
  AssistantReport,
  datasetIds,
  Datasets,
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

    expect(html.match(/border-l-4/g)).toHaveLength(3)
    expect(html).not.toContain("lg:grid-cols-3")
    expect(html.indexOf(words.researcher)).toBeLessThan(
      html.indexOf(words.submitter),
    )
    expect(html.indexOf(words.submitter)).toBeLessThan(
      html.indexOf(words.institutionHead),
    )
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

  it("取得できた個別の制限事項はそのまま表示する", () => {
    const html = renderReport({
      dataset_analysis_list: [
        { id: "JGAD000001", found_in_database: true },
      ],
      dataset_policy_groups: [{
        dataset_ids: ["JGAD000001"],
        policy_text: "個別の利用条件",
      }],
    })

    expect(html).toContain("個別の利用条件")
    expect(html).not.toContain("href=\"/policy-companylimitation\"")
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
