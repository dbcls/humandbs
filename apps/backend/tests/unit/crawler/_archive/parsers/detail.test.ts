import { describe, expect, it } from "bun:test"

import { parseDetailPage } from "@/crawler/parsers/detail"

describe("parsers/detail.ts", () => {
  describe("parseDetailPage", () => {
    it("should parse minimal page with summary section", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <p><strong>Aims:</strong> To study disease X</p>
              <p><strong>Methods:</strong> WGS analysis</p>
              <p><strong>Participants:</strong> 100 patients</p>
              <table>
                <thead>
                  <tr>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>Controlled-access (Type I)</td>
                    <td>2024/1/15</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.summary.aims.text).toContain("study disease X")
      expect(result.summary.methods.text).toContain("WGS analysis")
      expect(result.summary.targets.text).toContain("100 patients")
      expect(result.summary.datasets).toHaveLength(1)
      expect(result.summary.datasets[0].datasetId).toBe("JGAD000001")
      expect(result.summary.datasets[0].typeOfData).toBe("WGS")
    })

    it("should parse Japanese summary section", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>研究内容の概要</h2>
              <p><strong>目的:</strong> 疾患Xの研究</p>
              <p><strong>方法:</strong> WGS解析</p>
              <p><strong>対象:</strong> 患者100名</p>
              <table>
                <thead>
                  <tr>
                    <th>データID</th>
                    <th>内容</th>
                    <th>制限</th>
                    <th>公開日</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>制限公開(TypeI)</td>
                    <td>2024/1/15</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "ja")

      expect(result.summary.aims.text).toContain("疾患Xの研究")
      expect(result.summary.methods.text).toContain("WGS解析")
      expect(result.summary.targets.text).toContain("患者100名")
    })

    it("should parse molecular data section", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <p><strong>Aims:</strong> Test</p>
              <table>
                <thead>
                  <tr>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>Controlled-access</td>
                    <td>2024/1/15</td>
                  </tr>
                </tbody>
              </table>
              <h2>Molecular Data</h2>
              <p>JGAD000001</p>
              <table>
                <tr>
                  <td>Sample Size</td>
                  <td>100</td>
                </tr>
                <tr>
                  <td>Platform</td>
                  <td>Illumina NovaSeq</td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.molecularData).toHaveLength(1)
      expect(result.molecularData[0].id.text).toBe("JGAD000001")
      expect(result.molecularData[0].data["Sample Size"]?.text).toBe("100")
      expect(result.molecularData[0].data.Platform?.text).toBe("Illumina NovaSeq")
    })

    it("should parse data provider section", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <p><strong>Aims:</strong> Test</p>
              <table>
                <thead>
                  <tr>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>-</td>
                    <td>2024/1/15</td>
                  </tr>
                </tbody>
              </table>
              <h2>Data Provider</h2>
              <p><strong>Principal Investigator:</strong> Dr. Yamada Taro</p>
              <p><strong>Affiliation:</strong> University of Tokyo</p>
              <p><strong>Project Name:</strong> Genome Research Project</p>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Project Number</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JSPS</td>
                    <td>Genome Study</td>
                    <td>JP12345678</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.dataProvider.principalInvestigator).toHaveLength(1)
      expect(result.dataProvider.principalInvestigator[0].text).toContain("Dr. Yamada Taro")
      expect(result.dataProvider.affiliation).toHaveLength(1)
      expect(result.dataProvider.affiliation[0].text).toContain("University of Tokyo")
      expect(result.dataProvider.projectName).toHaveLength(1)
      expect(result.dataProvider.grants).toHaveLength(1)
      expect(result.dataProvider.grants[0].grantName).toBe("JSPS")
      expect(result.dataProvider.grants[0].grantId).toContain("JP12345678")
    })

    it("should parse publications section", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <p><strong>Aims:</strong> Test</p>
              <table>
                <thead>
                  <tr>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>-</td>
                    <td>2024/1/15</td>
                  </tr>
                </tbody>
              </table>
              <h2>Publications</h2>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Title</th>
                    <th>DOI</th>
                    <th>Dataset ID</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1</td>
                    <td>Genomic analysis of disease X</td>
                    <td><a href="https://doi.org/10.1234/test">10.1234/test</a></td>
                    <td>JGAD000001</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.publications).toHaveLength(1)
      expect(result.publications[0].title).toBe("Genomic analysis of disease X")
      expect(result.publications[0].doi).toBe("https://doi.org/10.1234/test")
      expect(result.publications[0].datasetIds).toContain("JGAD000001")
    })

    it("should parse controlled access users section", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <p><strong>Aims:</strong> Test</p>
              <table>
                <thead>
                  <tr>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>-</td>
                    <td>2024/1/15</td>
                  </tr>
                </tbody>
              </table>
              <h2>Users (Approved to Use the Controlled Data)</h2>
              <table>
                <thead>
                  <tr>
                    <th>PI</th>
                    <th>Affiliation</th>
                    <th>Country/Region</th>
                    <th>Research Title</th>
                    <th>Data in Use (Dataset ID)</th>
                    <th>Period of Data Use</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Dr. Smith</td>
                    <td>MIT</td>
                    <td>USA</td>
                    <td>Cancer genomics study</td>
                    <td>JGAD000001</td>
                    <td>2024/1/1-2025/12/31</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.controlledAccessUsers).toHaveLength(1)
      expect(result.controlledAccessUsers[0].principalInvestigator).toBe("Dr. Smith")
      expect(result.controlledAccessUsers[0].affiliation).toBe("MIT")
      expect(result.controlledAccessUsers[0].country).toBe("USA")
      expect(result.controlledAccessUsers[0].researchTitle).toBe("Cancer genomics study")
      expect(result.controlledAccessUsers[0].datasetIds).toContain("JGAD000001")
    })

    it("should parse URL links in summary", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <p><strong>Aims:</strong> Test</p>
              <p><strong>URL:</strong> <a href="https://example.com/data">Project Website</a></p>
              <table>
                <thead>
                  <tr>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>-</td>
                    <td>2024/1/15</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.summary.url).toHaveLength(1)
      expect(result.summary.url[0].text).toBe("Project Website")
      expect(result.summary.url[0].url).toBe("https://example.com/data")
    })

    it("should handle page without articleBody", () => {
      const html = `
        <html>
          <body>
            <div>No articleBody here</div>
          </body>
        </html>
      `

      expect(() => parseDetailPage(html, "hum0001-v1", "en")).toThrow("articleBody not found")
    })

    it("should handle empty sections gracefully", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <table>
                <thead>
                  <tr>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.summary.datasets).toEqual([])
      expect(result.molecularData).toEqual([])
      expect(result.dataProvider.principalInvestigator).toEqual([])
      expect(result.publications).toEqual([])
      expect(result.controlledAccessUsers).toEqual([])
    })

    it("should handle multiple datasets in summary table", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <p><strong>Aims:</strong> Test</p>
              <table>
                <thead>
                  <tr>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>Controlled-access (Type I)</td>
                    <td>2024/1/15</td>
                  </tr>
                  <tr>
                    <td>JGAD000002</td>
                    <td>WES</td>
                    <td>Controlled-access (Type II)</td>
                    <td>2024/2/20</td>
                  </tr>
                  <tr>
                    <td>DRA001234</td>
                    <td>RNA-seq</td>
                    <td>Unrestricted-access</td>
                    <td>2024/3/25</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.summary.datasets).toHaveLength(3)
      expect(result.summary.datasets[0].datasetId).toBe("JGAD000001")
      expect(result.summary.datasets[1].datasetId).toBe("JGAD000002")
      expect(result.summary.datasets[2].datasetId).toBe("DRA001234")
    })

    it("should parse multiple molecular data tables", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <p><strong>Aims:</strong> Test</p>
              <table>
                <thead>
                  <tr>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>-</td>
                    <td>2024/1/15</td>
                  </tr>
                </tbody>
              </table>
              <h2>Molecular Data</h2>
              <p>JGAD000001 - Exome</p>
              <table>
                <tr>
                  <td>Sample Size</td>
                  <td>100</td>
                </tr>
              </table>
              <p>JGAD000002 - WGS</p>
              <table>
                <tr>
                  <td>Sample Size</td>
                  <td>200</td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.molecularData).toHaveLength(2)
      expect(result.molecularData[0].id.text).toContain("JGAD000001")
      expect(result.molecularData[0].data["Sample Size"]?.text).toBe("100")
      expect(result.molecularData[1].id.text).toContain("JGAD000002")
      expect(result.molecularData[1].data["Sample Size"]?.text).toBe("200")
    })

    it("should handle footer content after summary table", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <p><strong>Aims:</strong> Test aims</p>
              <table>
                <thead>
                  <tr>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>-</td>
                    <td>2024/1/15</td>
                  </tr>
                </tbody>
              </table>
              <p>※ This is a footnote about the data</p>
              <h2>Molecular Data</h2>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.summary.footers).toHaveLength(1)
      expect(result.summary.footers[0].text).toContain("footnote")
    })

    it("should handle 5-column dataset table (with extra first column)", () => {
      const html = `
        <html>
          <body>
            <div class="articleBody">
              <h2>Summary</h2>
              <p><strong>Aims:</strong> Test</p>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Dataset ID</th>
                    <th>Type of Data</th>
                    <th>Criteria</th>
                    <th>Release Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1</td>
                    <td>JGAD000001</td>
                    <td>WGS</td>
                    <td>Controlled-access</td>
                    <td>2024/1/15</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </body>
        </html>
      `

      const result = parseDetailPage(html, "hum0001-v1", "en")

      expect(result.summary.datasets).toHaveLength(1)
      expect(result.summary.datasets[0].datasetId).toBe("JGAD000001")
    })
  })
})
