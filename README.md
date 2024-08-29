# humandbs

NBDCヒトデータベースのデータセット毎のレコードを生成する


## 準備

NIG-SC の以下のデータにアクセスもしくは取得が必要

```
git clone -b dev git@github.com:dbcls/humandbs.git
cd humandbs
scp -r nig-sc:/lustre9/open/database/ddbjshare/private/ddbj.nig.ac.jp/jga/metadata .
scp -r nig-sc:/lustre9/open/shared_data/dblink .
scp nig-sc:/home/ddbjshare/ddbj-dbcls-human/sample-attributes-per-dataset-20240820.jsonl .
```

## 制限アクセスデータセットの生成

jga-dataset.xmlからに出力
```
ruby bin/build_jsonl_from_jga_dataset_xml.rb metadata/jga-dataset.xml 
```
TODO `datasetに紐づく各種属性をマージ`

結果の例
```
{
  "alias": "JSUB000191_Dataset_0001",
  "center_name": "Individual",
  "accession": "JGAD000220",
  "submission_date": "2018-03-20T00:00:00+09:00",
  "IDENTIFIERS": {
    "SECONDARY_ID": "JGAD00000000220"
  },
  "TITLE": "BBJ Whole Genome Sequencing",
  "DESCRIPTION": "Whole Genome Sequence fastq files of the samples in the Biobank Japan project.",
  "DATASET_TYPE": "Whole genome sequencing",
  "POLICY_REF": {
    "refname": "JGAP000001",
    "refcenter": "nbdc",
    "accession": "JGAP000001"
  },
  "DATA_REF": [
    {
      "refname": "JGAR000048214",
      "refcenter": "Individual",
      "accession": "JGAR000048214"
    },
    {
      "refname": "JGAR000048215",
      "refcenter": "Individual",
      "accession": "JGAR000048215"
    },
...
    {
      "refname": "JGAR000049239",
      "refcenter": "Individual",
      "accession": "JGAR000049239"
    }
  ],
  "ANALYSIS_REF": {
    "refname": "JGAZ000071599",
    "refcenter": "Individual",
    "accession": "JGAZ000071599"
  },
  "dateCreated": "2018-06-19 17:03:05.368922+09",
  "datePublished": "2020-09-28 11:25:34.810524+09",
  "dateModified": "2022-08-23 16:26:50.870905+09",
  "samples": {
    "id": "JGAD000220",
    "dbXrefsStatistics": [
      {
        "type": "jga-sample",
        "count": 3541
      }
    ],
    "attribute": [
...
      {
        "name": "gender",
        "value": "male",
        "count": 1841
      },
      {
        "name": "gender",
        "value": "female",
        "count": 1700
      }
    ]
  }
}

```

## 非制限アクセスデータセット生成
```
TODO
```


### humandb_both.json
humandb_both.jsonからdataset毎に要素のデータをJSON Lineで取得する

### SUMMARY
TODO `humID → jga-study  → jga-datasetを辿って取得`

### DATA PROVIDER
TODO `humID → jga-study  → jga-datasetを辿って取得`

### DATA(SET)
TODO `jga-study  → jga-dataset`でさらにばらす
```
%ruby bin/split_data_each_dataset_from_humandb_both.json.rb json_from_joomla/humandb_20231223_both.json |head -30
{"id":"JGAS000643","NBDC Research ID":"hum0429.v1","Data Set ID":"JGAS000643","Type of Data":"NGS（WGS, RNA-seq）","Criteria":"Controlled-access (Type I)","Release Date":"2023/11/13","lang":"en"}
{"id":"JGAS000645","NBDC Research ID":"hum0427.v1","Data Set ID":"JGAS000645","Type of Data":"NGS (Exome)","Criteria":"Controlled-access (Type I)","Release Date":"2023/11/02","lang":"en"}
{"id":"E-GEAD-635","NBDC Research ID":"hum0416.v1","Data Set ID":"E-GEAD-635","Type of Data":"NGS (CITE-seq)","Criteria":"Unrestricted-access","Release Date":"2023/08/10","lang":"en"}
{"id":"DRA016800","NBDC Research ID":"hum0414.v1","Data Set ID":"DRA016800","Type of Data":"NGS (WGS)","Criteria":"Unrestricted-access","Release Date":"2023/07/25","lang":"en"}
{"id":"JGAS000628","NBDC Research ID":"hum0413.v1","Data Set ID":"JGAS000628","Type of Data":"NGS (RNA-seq)","Criteria":"Controlled-access (Type I)","Release Date":"2023/07/20","lang":"en"}
{"id":"JGAS000625","NBDC Research ID":"hum0411.v1","Data Set ID":"JGAS000625","Type of Data":"NGS (Exome)","Criteria":"Controlled-access (Type I)","Release Date":"2023/07/18","lang":"en"}
{"id":"JGAS000619","NBDC Research ID":"hum0409.v1","Data Set ID":"JGAS000619","Type of Data":"NGS (Exome)\r\nNGS (RNA-seq)\r\nNGS (Target Capture)","Criteria":"Controlled-access (Type I)","Release Date":"2023/06/27","lang":"en"}
{"id":"JGAS000617","NBDC Research ID":"hum0406.v1","Data Set ID":"JGAS000617","Type of Data":"NGS (RNA-seq)","Criteria":"Controlled-access (Type I)","Release Date":"2023/08/29","lang":"en"}
{"id":"E-GEAD-623","NBDC Research ID":"hum0406.v1","Data Set ID":"E-GEAD-623","Type of Data":"NGS (RNA-seq)","Criteria":"Unrestricted-access","Release Date":"2023/08/29","lang":"en"}
{"id":"JGAS000622","NBDC Research ID":"hum0403.v1","Data Set ID":"JGAS000622","Type of Data":"NGS (Target Capture)","Criteria":"Controlled-access (Type I)","Release Date":"2023/07/27","lang":"en"}
{"id":"JGAS000618","NBDC Research ID":"hum0401.v1","Data Set ID":"JGAS000618","Type of Data":"NGS (Exome, RNA-seq)","Criteria":"Controlled-access (Type I)","Release Date":"2023/06/29","lang":"en"}
{"id":"JGAS000621","NBDC Research ID":"hum0390.v1","Data Set ID":"JGAS000621","Type of Data":"NGS (RNA-seq)","Criteria":"Controlled-access (Type I)","Release Date":"2023/06/30","lang":"en"}
{"id":"JGAS000605","NBDC Research ID":"hum0389.v1","Data Set ID":"JGAS000605","Type of Data":"NGS (Capture Methyl-seq)","Criteria":"Controlled-access (Type I)","Release Date":"2023/04/04","lang":"en"}
{"id":"DRA015813","NBDC Research ID":"hum0386.v1","Data Set ID":"DRA015813","Type of Data":"NGS (WGS)","Criteria":"Unrestricted-access","Release Date":"2023/04/11","lang":"en"}
{"id":"JGAS000597","NBDC Research ID":"hum0385.v1","Data Set ID":"JGAS000597","Type of Data":"NGS (Exome)","Criteria":"Controlled-access (Type I)","Release Date":"2023/12/14","lang":"en"}
{"id":"JGAS000602","NBDC Research ID":"hum0383.v1","Data Set ID":"JGAS000602","Type of Data":"NGS (RNA-seq)","Criteria":"Controlled-access (Type I)","Release Date":"2023/03/28","lang":"en"}
{"id":"JGAS000587","NBDC Research ID":"hum0382.v1","Data Set ID":"JGAS000587","Type of Data":"NGS (WGS)","Criteria":"Controlled-access (Type I)","Release Date":"2023/01/19","lang":"en"}
{"id":"JGAS000588","NBDC Research ID":"hum0381.v1","Data Set ID":"JGAS000588","Type of Data":"NGS (Target Capture)","Criteria":"Controlled-access (Type I)","Release Date":"2023/01/05","lang":"en"}
{"id":"JGAS000578","NBDC Research ID":"hum0379.v1","Data Set ID":"JGAS000578","Type of Data":"NGS (scRNA-seq, scVDJ-seq)","Criteria":"Controlled-access (Type I)","Release Date":"2023/11/20","lang":"en"}
{"id":"JGAS000579","NBDC Research ID":"hum0377.v1","Data Set ID":"JGAS000579","Type of Data":"NGS (Amplicon-seq)","Criteria":"Controlled-access (Type I)","Release Date":"2022/12/13","lang":"en"}
{"id":"JGAS000585","NBDC Research ID":"hum0376.v2","Data Set ID":"JGAS000585","Type of Data":"NGS (Target Capture)","Criteria":"Controlled-access (Type I)","Release Date":"2022/12/27","lang":"en"}
{"id":"JGAS000585 (Data addition)","NBDC Research ID":"hum0376.v2","Data Set ID":"JGAS000585 (Data addition)","Type of Data":"NGS (Target Capture)","Criteria":"Controlled-access (Type I)","Release Date":"2023/03/28","lang":"en"}
{"id":"JGAS000572","NBDC Research ID":"hum0372.v1","Data Set ID":"JGAS000572","Type of Data":"the abundance of the 364 serum metabolites","Criteria":"Controlled-access (Type I)","Release Date":"2022/11/22","lang":"en"}
{"id":"MTBKS213","NBDC Research ID":"hum0372.v1","Data Set ID":"MTBKS213, MTBKS214","Type of Data":"the summary statistics","Criteria":"Unrestricted-access","Release Date":"2022/11/22","lang":"en"}
{"id":"MTBKS214","NBDC Research ID":"hum0372.v1","Data Set ID":"MTBKS213, MTBKS214","Type of Data":"the summary statistics","Criteria":"Unrestricted-access","Release Date":"2022/11/22","lang":"en"}
{"id":"JGAS000574","NBDC Research ID":"hum0371.v1","Data Set ID":"JGAS000574","Type of Data":"Metagenome","Criteria":"Controlled-access (Type I)","Release Date":"2022/12/22","lang":"en"}
{"id":"JGAS000562","NBDC Research ID":"hum0369.v1","Data Set ID":"JGAS000562","Type of Data":"NGS (Target Capture)","Criteria":"Controlled-access (Type I)","Release Date":"2022/09/28","lang":"en"}
{"id":"JGAS000559","NBDC Research ID":"hum0368.v1","Data Set ID":"JGAS000559","Type of Data":"NGS (PBAT-seq)","Criteria":"Controlled-access (Type I)","Release Date":"2022/11/29","lang":"en"}
{"id":"JGAS000558","NBDC Research ID":"hum0367.v1","Data Set ID":"JGAS000558","Type of Data":"NGS (Target Capture)","Criteria":"Controlled-access (Type I)","Release Date":"2021/09/21","lang":"en"}
{"id":"E-GEAD-551","NBDC Research ID":"hum0366.v1","Data Set ID":"E-GEAD-551","Type of Data":"NGS (scRNA-seq)","Criteria":"Unrestricted-access","Release Date":"2023/03/16","lang":"en"}
```

### MOLECULAR DATA
TODO 
```
%ruby bin/split_moleculardata_each_dataset_from_humandb_both.json.rb json_from_joomla/humandb_20231223_both.json |grep hum0014 |jq
{
  "id": "hum0014.v1.freq.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "1666 MI patients and 3198 controls",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [Human610-Quad BeadChip, HumanHap550v3 Genotyping BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "Illumina Human610-Quad Beadchip",
  "Genotype Call Methods (software)": "GenCall software (GenomeStudio)",
  "Filtering Methods": "sample call rate ≧ 0.98, SNP call rate ≧ 0.99, HWE P ≧ 1 x 10^-6",
  "Marker Number (after QC)": "455,781 SNPs (hg18/GRCh36)",
  "NBDC Dataset ID": "hum0014.v1.freq.v1\r\n (Click the Dataset ID to download the file)\r\nDictionary file",
  "Total Data Volume": "71.3 MB (xlsx)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v2.jsnp.934ctrl.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "934 Japanese healthy individuals (JSNP)",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanHap550v3 Genotyping BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "Illumina HumanHap550v3 Genotyping BeadChip",
  "Genotype Call Methods (software)": "GenCall software (GenomeStudio)",
  "Filtering Methods": "sample call rate < 0.98, SNP call rate < 0.99, HWE P < 1 x 10^-6",
  "Marker Number (after QC)": "515,286 SNPs",
  "NBDC Dataset ID": "hum0014.v2.jsnp.934ctrl.v1\r\n (Click the Dataset ID to download the file) \r\nDictionary file",
  "Total Data Volume": "32.2 M (zip [xls])",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "35 Diseases",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "Cancer (Lung cancer, Breast cancer, Gastric cancer, Colorectal cancer, Prostate cancer) \r\nCardiovascular diseases (Heart failure, Myocardial infarction, Unstable angina, Stable angina, Cardiac arrhythmias, Arteriosclerosis obliterans) \r\nCerebrovascular disorders (Brain infarction, Intracranial aneurysm) \r\nRespiratory tract diseases (Interstitial pneumonitis & pulmonary fibrosis, Pulmonary emphysema, Bronchial asthma) \r\nChronic liver diseases (Chronic hepatitis C, Liver cirrhosis) \r\nEye diseases (Cataract, Glaucoma) \r\nOthers (Epilepsy, Periodontal disease, Urolithiasis, Nephrotic syndrome, Uterine myoma, Endometriosis, \r\n Osteoporosis, Rheumatoid arthritis, Amyotrophic lateral sclerosis, Hay fever, Atopic dermatitis, \r\nDrug eruptions , Hyperlipidemias, Diabetes mellitus, Basedow disease ) \r\n \r\nabout 190 patients in each disease set",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Perlegen Sciences [high-density oligonucleotide arrays]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "-",
  "Genotype Call Methods (software)": "-",
  "Filtering Methods": "-",
  "Marker Number (after QC)": "About 200,000 SNPs (b129)",
  "NBDC Dataset ID": "Cancer (Lung cancer, Breast cancer, Gastric cancer, Colorectal cancer, Prostate cancer) \r\nCardiovascular diseases (Heart failure, Myocardial infarction, Unstable angina, Stable angina, Cardiac arrhythmias, Arteriosclerosis obliterans) \r\nCerebrovascular disorders (Brain infarction, Intracranial aneurysm) \r\nRespiratory tract diseases (Interstitial pneumonitis & pulmonary fibrosis, Pulmonary emphysema, Bronchial asthma) \r\nChronic liver diseases (Chronic hepatitis C, Liver cirrhosis) \r\nEye diseases (Cataract, Glaucoma) \r\nOthers (Epilepsy, Periodontal disease, Urolithiasis, Nephrotic syndrome, Uterine myoma, Endometriosis, \r\nOsteoporosis, Rheumatoid arthritis, Amyotrophic lateral sclerosis, Hay fever, Atopic dermatitis, \r\nDrug eruptions, Hyperlipidemias, Diabetes mellitus, Basedow disease) \r\n (Click the disease names to download the file) \r\nDictionary file",
  "Total Data Volume": null,
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v2.jsnp.182ec.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "182 esophageal cancer patients (JSNP)",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanHap550v3 Genotyping BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "Illumina HumanHap550v3 Genotyping BeadChip",
  "Genotype Call Methods (software)": "GenCall software (GenomeStudio)",
  "Filtering Methods": "sample call rate < 0.98, SNP call rate < 0.99, HWE P < 1 x 10^-6",
  "Marker Number (after QC)": "503,734 SNPs",
  "NBDC Dataset ID": "hum0014.v2.jsnp.182ec.v1\r\n (Click the Dataset ID to download the file) \r\nDictionary file",
  "Total Data Volume": "6.6 MB (zip [txt])",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v2.jsnp.92als.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "92 ALS patients (JSNP)",
  "Targets": "large-scale case-control association study",
  "Target Loci for Capture Methods": "-",
  "Platform": "Hologic Japan [Invader]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "Invader assay system (Third Wave Technologies)",
  "Genotype Call Methods (software)": "ABI PRISM SDS versions 2.0 - 2.2",
  "Filtering Methods": "SNP call rate ≥ 0.95, HWE P ≥1.0 x 10^-2",
  "Marker Number (after QC)": "48,939 SNPs",
  "NBDC Dataset ID": "hum0014.v2.jsnp.92als.v1\r\n (Click the Dataset ID to download the file) \r\nDictionary file",
  "Total Data Volume": "3.2 MB (zip [txt])",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v3.T2DM-1.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "9817 T2DM patients\r\n6763 controls (healthy individuals and patients with Intracranial aneurysm, Esophageal cancer, Uterine cancer, Pulmonary emphysema, or Glaucoma [without T2DM])",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [OmniExpressExome Beadchip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "Illumina OmniExpressExome Beadchip kit",
  "Genotype Call Methods (software)": "GenCall software (GenomeStudio)",
  "Filtering Methods": "sample call rate < 0.98, SNP call rate < 0.99, MAF < 0.01, HWE P < 1 x 10^-6 in control",
  "Marker Number (after QC)": "552,915 SNPs (hg19)",
  "NBDC Dataset ID": "hum0014.v3.T2DM-1.v1\r\n (Click the Dataset ID to download the file) \r\nDictionary file",
  "Total Data Volume": "84.0 MB (xlsx)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v3.T2DM-2.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "5646 T2DM patients\r\n19,420 controls (patients with Colorectal cancer, Breast cancer, Prostate cancer, Lung cancer, Gastric cancer, \r\nArteriosclerosis obliterans, Cardiac arrhythmias, Brain infarction, Myocardial infarction, Gallbladder cancer and Cholangiocarcinoma, Pancreatic cancer, Drug eruptions, \r\nRheumatoid arthritis, Amyotrophic lateral sclerosis, Liver cancer, Liver cirrhosis, Osteoporosis, or Uterine myoma [without T2DM])",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [Human610-Quad BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "Illumina Human610-Quad Beadchip kit",
  "Genotype Call Methods (software)": "GenCall software (GenomeStudio)",
  "Filtering Methods": "sample call rate < 0.98, SNP call rate < 0.99, MAF < 0.01, HWE P < 1 x 10^-6 in control",
  "Marker Number (after QC)": "479,088 SNPs (hg18)",
  "NBDC Dataset ID": "hum0014.v3.T2DM-2.v1\r\n (Click the Dataset ID to download the file) \r\nDictionary file",
  "Total Data Volume": "72.6 MB (xlsx)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v4.AD.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "1472 AD patients\r\n7966 controls (healthy individuals and patients with Intracranial aneurysm, Esophageal cancer, \r\n         Uterine cancer, Pulmonary emphysema, or Glaucoma [without AD and Bronchial asthma])",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress BeadChip",
  "Genotype Call Methods (software)": "minimac [imputation (1000 genomes Phase I v3)]",
  "Filtering Methods": "Genotyping QC: sample call rate < 0.98, SNV call rate < 0.99, \r\n                           HWE P < 1 x 10^-6 in the control samples\r\nImputation QC: HWE P < 1 x 10^-6 or MAF < 0.01 in the reference panel\r\n                         Differences of MAF between the GWAS dataset and the reference panel > 0.16",
  "Marker Number (after QC)": "About 7,700,000 SNPs (hg19)",
  "NBDC Dataset ID": "hum0014.v4.AD.v1\r\n (Click the Dataset ID to download the file)\r\nDictionary file",
  "Total Data Volume": "ADGWAS_auto.txt (525 MB)\r\nADGWAS_X_females.txt (17 MB)\r\nADGWAS_X_males.txt (15 MB)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000101 / hum0014.v5.AF.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "8180 atrial fibrillation patients and 28,612 controls",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "DNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "minimac [imputation (1000 genomes Phase I v3)]\r\nGenCall software（GenomeStudio）",
  "Filtering Methods": "Genotyping QC: sample call rate < 0.98, SNV call rate < 0.99, \r\n                           HWE P < 1 x 10^-6 in the control samples\r\nImputation QC: HWE P < 1 x 10^-6 or MAF < 0.01 in the reference panel\r\n                         Differences of MAF between the GWAS dataset and the reference panel > 0.16\r\n                         R square < 0.9",
  "Marker Number (after QC)": "About 5,000,000 SNVs",
  "NBDC Dataset ID": null,
  "Total Data Volume": "GWAS: 473 MB (txt)\r\nIndividual phenotype-genotype data: 1 GB (txt)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000114 / hum0014.v6.158k.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "182,505 individuals (158,284 individuals for BMI study)",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "DNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "minimac [imputation (1000 genomes Phase I v3)] \r\nGenCall software (GenomeStudio)",
  "Filtering Methods": "Genotyping QC: sample call rate < 0.98, SNV call rate < 0.99, HWE P < 1 x 10^-6\r\nQC for reference panel:\r\nAfter excluding 11 closely related individuals, variants with HWE P < 1.0 x 10^-6, MAF < 0.01 were excluded.\r\nQC after imputation:\r\nVariants with imputation quality of Rsq < 0.7 were excluded.",
  "Marker Number (after QC)": "About 6,000,000 and 150,000 SNVs on autosomes and X-chromosome, respectively.",
  "NBDC Dataset ID": null,
  "Total Data Volume": "GWAS: 406 MB (zip)\r\nPhenotype data (BMI): 3.32 MB (txt.gz)\r\nGenotype data: 26.3GB (csv.gz)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v7.POAG.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "3980 POAG patients (Male: 1,997, Female: 1,983)\r\n18,815 controls (Male: 7,817, Female: 10,998)",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "minimac（ver. 0.1.1） [imputation (1000 genomes Phase I v3)]",
  "Filtering Methods": "Genotyping QC: sample call rate < 0.98, SNV call rate < 0.99, HWE P < 1 x 10^-6\r\nQC for reference panel: After excluding 11 closely related individuals, variants with HWE P < 1.0 x 10^-6, MAF < 0.01 were excluded. \r\nQC after imputation: Variants with imputation quality of Rsq < 0.7 were excluded. We also excluded variants with |beta| > 4 in the uploaded files.",
  "Marker Number (after QC)": "autosomes: 5,961,428 SNPs (hg19)\r\nmale X-chromosome: 147,351 SNPs (hg19)\r\nfemale X-chromosome: 147,353 SNPs (hg19)",
  "NBDC Dataset ID": "hum0014.v7.POAG.v1\r\n (Click the Dataset ID to download the file)\r\nDictionary file",
  "Total Data Volume": "113 MB (txt.zip)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000114 / hum0014.v8.58qt.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "162,255 individuals for 58 quantitative traits",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "DNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "minimac [imputation (1000 genomes Phase I v3)] \r\nGenCall software (GenomeStudio)",
  "Filtering Methods": "Genotyping QC: sample call rate < 0.98, SNV call rate < 0.99, HWE P < 1 x 10^-6\r\nQC for reference panel:\r\nAfter excluding 11 closely related individuals, variants with HWE P < 1.0 x 10^-6, MAF < 0.01 were excluded.\r\nQC after imputation:\r\nVariants with imputation quality of Rsq < 0.7 were excluded.",
  "Marker Number (after QC)": "5,961,600 and 147,353 SNVs on autosomes and X-chromosome, respectively.",
  "NBDC Dataset ID": null,
  "Total Data Volume": "GWAS: 123 MB (zip) on average\r\nPhenotype data (58 quantitative traits): 2.4 MB (txt.gz) on average",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v9.Men.v1 / hum0014.v9.MP.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "67,029 females with information on age at menarche \r\n43,861 females with information on age at menopause",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "minimac [imputation (1000 genomes Phase I v3)] \r\nGenCall software (GenomeStudio)",
  "Filtering Methods": "Genotyping QC: sample call rate < 0.98, SNV call rate < 0.99, HWE P < 1 x 10^-6\r\nQC for reference panel: After excluding 11 closely related individuals, variants with HWE P < 1.0 x 10^-6, MAF < 0.01 were excluded. \r\nQC after imputation: Variants with imputation quality of Rsq < 0.7 were excluded. We also excluded variants with |beta| > 4 in the uploaded files.",
  "Marker Number (after QC)": "9,296,729 SNPs (hg19)",
  "NBDC Dataset ID": "menarche: hum0014.v9.Men.v1\r\nmenopause: hum0014.v9.MP.v1\r\n (Click the Dataset ID to download the file)\r\nmenarche: Dictionary file\r\nmenopause: Dictionary file",
  "Total Data Volume": "menarche: 181 MB (txt.gz)\r\nmenopause: 186 MB (txt.gz)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000114 (JGAD000220 / JGAD000410 / JGAD000690 / JGAD000758)",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "1,026 individuals",
  "Targets": "WGS",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HiSeq 2500]",
  "Source": null,
  "Cell Lines": "-",
  "Reagents (Kit, Version)": null,
  "Genotype Call Methods (software)": null,
  "Filtering Methods": null,
  "Marker Number (after QC)": null,
  "NBDC Dataset ID": null,
  "Total Data Volume": "JGAD000220: 73 TB (fastq)\r\nJGAD000410: 49 TB (bam, vcf)\r\nJGAD000690: 52.1 TB (bam, bai, vcf, document)\r\nJGAD000758: 203.8 GB (vcf_aggregate, tabix)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000140",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "7,104 breast cancer patients and 23,731 controls",
  "Targets": "Target Capture",
  "Target Loci for Capture Methods": "11 hereditary breast cancer genes (ATM, BRCA1, BRCA2, CDH1, CHEK2, NBN, NF1, PALB2, PTEN, STK11, TP53)",
  "Platform": "Illumina [HiSeq 2500]",
  "Source": null,
  "Cell Lines": "-",
  "Reagents (Kit, Version)": null,
  "Genotype Call Methods (software)": null,
  "Filtering Methods": null,
  "Marker Number (after QC)": null,
  "NBDC Dataset ID": null,
  "Total Data Volume": "1 TB (fastq)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "*1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "[GWAS-1]\r\n   - 2,380 T2DM with diabetic nephropathy patients\r\n   - 5,234 T2DM without diabetic nephropathy patients\r\n[GWAS-2]\r\n   - 429 T2DM with diabetic nephropathy patients\r\n   - 358 T2DM without diabetic nephropathy patients",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [OmniExpressExome Beadchip, Human610-Quad BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "Illumina OmniExpressExome Beadchip kit\r\nIllumina Human610-Quad Beadchip kit",
  "Genotype Call Methods (software)": "MACH and Minimac (1000 Genomes phased JPT, CHB and Han Chinese South data n = 275, March 2012)\r\nGenCall software (GenomeStudio)",
  "Filtering Methods": "sample call rate < 0.98, SNV call rate < 0.99, MAF < 0.1%, \r\nHWE P < 1 x 10-6 in control",
  "Marker Number (after QC)": "7,521,072 SNPs (hg19)",
  "NBDC Dataset ID": "hum0014.v12.T2DMw.v1\r\n (Click the Dataset ID to download the file) \r\nDictionary file",
  "Total Data Volume": "310 MB (csv.zip)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v12.T2DMwN.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "[GWAS-1]\r\n   - 9,804 T2DM patients (ICD-10: E11)\r\n   - 6,728 controls\r\n[GWAS-2]\r\n   - 5,639 T2DM patients (ICD-10: E11)\r\n   - 19,407 controls\r\n[GWAS-3]\r\n   - 18,688 T2DM patients (ICD-10: E11)\r\n   - 121,950 controls\r\n[GWAS-4]\r\n   - 2,483 T2DM patients (ICD-10: E11)\r\n   - 7,065 controls",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome, Human610-Quad BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome, Human610-Quad BeadChip kit",
  "Genotype Call Methods (software)": "minimac [imputation(1000 genomes Phase 3)]\r\nGenCall software (GenomeStudio)",
  "Filtering Methods": "Genotyping QC: \r\nexclusion criteria of GWAS1, GWAS3, GWAS4\r\n(i) hetero count < 5\r\n(ii) HWE P < 1.0 × 10^-6 on each chip\r\n(iii) genotype concordance rate < 0.99 with in-house WGS data\r\n(iv) SNV call rate < 0.99\r\n \r\nexclusion criteria of GWAS2\r\n(i) SNV call rate < 0.99\r\n(ii) MAF < 0.01\r\n(iii) differential missingness P < 1.0 × 10^-6\r\n(iv) HWE P < 1.0 × 10^-6\r\n \r\nImputation QC: \r\nHWE P < 1 × 10^-6 or MAF < 0.01 in the reference panel\r\nImputation quality (Rsq) < 0.3 in more than two GWAS",
  "Marker Number (after QC)": "12,557,761 SNPs (hg19)",
  "NBDC Dataset ID": "hum0014.v13.T2DMmeta.v1\r\n (Click the Dataset ID to download the file) \r\nDictionary file",
  "Total Data Volume": "257 MB (txt)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v13.T2DMmeta.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "165,436 individuals whose smoking status is available",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "minimac [imputation (1000 genomes Phase I v3)] \r\nGenCall software (GenomeStudio)",
  "Filtering Methods": "Genotyping QC: sample call rate < 0.98, SNV call rate < 0.99, HWE P < 1 x 10^-6\r\nQC for reference panel:\r\nAfter excluding 11 closely related individuals, variants with HWE P < 1.0 x 10^-6, MAF < 0.01 were excluded.\r\nQC after imputation:\r\nVariants with imputation quality of Rsq < 0.7 and MAF < 0.01 were excluded.",
  "Marker Number (after QC)": "autosomes: 5,961,480 SNVs (hg19)\r\nmale X-chromosome (Age of smoking initiation): 163,412 SNVs (hg19)\r\nfemale X-chromosome (Age of smoking initiation): 146,130 SNVs (hg19)\r\nmale X-chromosome (Cigarettes per day): 166,111 SNVs (hg19)\r\nfemale X-chromosome (Cigarettes per day): 146,114 SNVs (hg19)\r\nmale X-chromosome (Smoking initiation [Ever vs never smokers]): 166,138 SNVs (hg19)\r\nfemale X-chromosome (Smoking initiation [Ever vs never smokers]): 146,146 SNVs (hg19)\r\nmale X-chromosome (Smoking cessation [Former vs current smokers]): 166,142 SNVs (hg19)\r\nfemale X-chromosome (Smoking cessation [Former vs current smokers]): 146,118 SNVs (hg19)",
  "NBDC Dataset ID": "hum0014.v14.asi.v1.zip (Age of smoking initiation)\r\nhum0014.v14.cpd.v1.zip (Cigarettes per day)\r\nhum0014.v14.ens.v1.zip (Smoking initiation [Ever vs never smokers])\r\nhum0014.v14.fcs.v1.zip (Smoking cessation [Former vs current smokers])\r\n (Click the Dataset ID to download the file)\r\nDictionary file",
  "Total Data Volume": "1.9 GB (txt.gz)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v14.smok.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "- WGS data (JGAD000220) of the biobank Japan project (N=1,037)\r\n- WGS data of 1KGP p3v5 ALL (N=2,504) (ftp://ftp.1000genomes.ebi.ac.uk/vol1/ftp/release/20130502/)",
  "Targets": "a reference panel from WGS data \r\n(variants on autosomal chromosomes and X-chromosome)",
  "Target Loci for Capture Methods": "-",
  "Platform": null,
  "Source": null,
  "Cell Lines": null,
  "Reagents (Kit, Version)": null,
  "Genotype Call Methods (software)": null,
  "Filtering Methods": null,
  "Marker Number (after QC)": null,
  "NBDC Dataset ID": null,
  "Total Data Volume": "about 15 GB (vcf.gz)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000114 reference panel",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "159,095 individuals (Male: 86,257, Female: 72,838)",
  "Targets": "genome wide variants",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "Minimac3 [imputation reference panel using WGS data of the biobank Japan project (N=1,037) and 1KGP p3v5 ALL (N=2,504)]",
  "Filtering Methods": "Sample QCs: Exclusion criteria:\r\n1) call rate < 98%, \r\n2) closely related samples (PI_HAT > 0.175), and \r\n3) outlier from Japanese cluster determined by PCA using GCTA.\r\nQC after imputation: Variants with imputation quality of Rsq < 0.3 were excluded.",
  "Marker Number (after QC)": "autosomes: 27,211,524 variants (hg19)\r\nmale X-chromosome: 684,533 variants (hg19)\r\nfemale X-chromosome: 684,533 variants (hg19)",
  "NBDC Dataset ID": "hum0014.v15.ht.v1\r\n (Click the Dataset ID to download the file)\r\nDictionary file",
  "Total Data Volume": "about 663 MB (txt.gz)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "* ",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "7,636 prostate cancer patients (ICD10：C61) and 12,366 controls",
  "Targets": "Target Capture",
  "Target Loci for Capture Methods": "8 hereditary prostate cancer genes (ATM, BRCA1, BRCA2, BRIP1, CHEK2, HOXB13, NBN, PALB2)",
  "Platform": "Illumina [HiSeq 2500]",
  "Source": null,
  "Cell Lines": "-",
  "Reagents (Kit, Version)": null,
  "Genotype Call Methods (software)": null,
  "Filtering Methods": null,
  "Marker Number (after QC)": null,
  "NBDC Dataset ID": null,
  "Total Data Volume": "2.2 TB (fastq)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v15.ht.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "42 disease (ICD10 code) \r\nArrhythmia (I499), Bronchial asthma (J459), Atopic dermatitis (L209), \r\nGallbladder/Cholangiocarcinoma (C23, C240), Cataract (H269), \r\nCerebral aneurysm (I671), Cervical cancer (C539), \r\nChronic hepatitis B (B181), Chronic hepatitis C (B182), \r\nChronic obstructive pulmonary disease (J449), Liver cirrhosis (K746), \r\nColorectal cancer (C189, C20), Heart failure (I509, I500), \r\nDrug eruption (L270), Uterine cancer (C549), Endometriosis (N809), \r\nEpilepsy (G409), Esophageal cancer (C159), Gastric cancer (C169), \r\nGlaucoma (H409), Graves' disease (E050), Hematopoietic tumor (C81-96), \r\nLiver cancer (C220), Interstitial lung disease/Pulmonary fibrosis (J849, J841), \r\nCerebral infarction (I639), Keloid (L910), Lung cancer (C349), \r\nNephrotic syndrome (N049), Osteoporosis (M8199), Ovarian cancer (C56), \r\nPancreas cancer (C259), Periodontitis (K054), \r\nPeripheral artery disease (I709), Hay fever (J301), Prostate cancer (C61), \r\nPulmonary tuberculosis (A169), Rheumatoid arthritis (M0690), \r\nDiabetes mellitus (E14), Urolithiasis (N209), Uterine fibroids (D259), Breast cancer (C509)\r\nCoronary artery disease (I200, I209, I219)",
  "Targets": "genome wide variants",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "Minimac3 [imputation (1000 genomes Phase 3 v5)]\r\nGenCall software (GenomeStudio)",
  "Filtering Methods": "QC after imputation:\r\nExclusion criteria: Variants with imputation quality of Rsq < 0.7",
  "Marker Number (after QC)": "autosomes: 8,712,794 variants (hg19)\r\nX-chromosome: 207,198 variants (hg19)",
  "NBDC Dataset ID": null,
  "Total Data Volume": "autosomes: about 0.8-1.3 GB each\r\nX-chromosome: about 20-30 MB each",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000203",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "165,084 individuals whose dietary habits status is available (13 dietary traits)",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "GenCall software（GenomeStudio）\r\nMACH\r\nminimac (v.0.1.1) [imputation (1000 genomes Phase I v3)]",
  "Filtering Methods": "Genotyping QC: sample call rate < 0.98, SNV call rate < 0.99, MAF < 0.005\r\nQC for reference panel:\r\nVariants with HWE P < 1.0 x 10^-6, MAF < 0.01 were excluded from the reference panel.\r\nQC after imputation:\r\nVariants with imputation quality of Rsq < 0.7 and MAF < 0.01 were excluded.",
  "Marker Number (after QC)": "autosomes: 5,961,480 variants (hg19)\r\nX-chromosome: 148,568 variants for female, 170,117 variants for male (hg19)",
  "NBDC Dataset ID": null,
  "Total Data Volume": "6.3 GB (txt.zip)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v17 / hum0014.v18 / hum0014.v21",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "25,892 coronary artery disease patients (ICD10: I20-25) and 142,336 controls",
  "Targets": "genome wide variants",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "GenCall software (GenomeStudio)\r\nminimac3 (BBJ-CAD reference panel)",
  "Filtering Methods": "QC after imputation: Variants with imputation quality of Rsq < 0.3 and MAF < 0.0002 were excluded.",
  "Marker Number (after QC)": "autosomes: 19,707,525 variants (hg19)",
  "NBDC Dataset ID": "hum0014.v20.gwas.v1 (summary statistics)\r\nhum0014.v20.prs.v1 (polygenic risk score)\r\n (Click the Dataset ID to download the file)\r\nDictionary file",
  "Total Data Volume": "about 413 MB (txt.gz)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v19",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "11,234 subjects extracted from approximately 200,000 subjects registered in Biobank Japan between fiscal years 2003 to 2007",
  "Targets": "Target Capture",
  "Target Loci for Capture Methods": "23 genes related to clonal hematopoiesis\r\nASXL1, CBL, CEBPA, DDX41, DNMT3A, ETV6, EZH2, GATA2, GNAS, GNB1, IDH1, IDH2, JAK2, KRAS, MYD88, NRAS, PPM1D, RUNX1, SF3B1, SRSF2, TET2, TP53, U2AF1",
  "Platform": "Illumina [HiSeq 2500]",
  "Source": null,
  "Cell Lines": "-",
  "Reagents (Kit, Version)": null,
  "Genotype Call Methods (software)": null,
  "Filtering Methods": "Genomon pipeline",
  "Marker Number (after QC)": null,
  "NBDC Dataset ID": null,
  "Total Data Volume": "5.3 MB (txt)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v20.cad.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "11,234 subjects extracted from approximately 200,000 subjects registered in Biobank Japan between fiscal years 2003 to 2007",
  "Targets": "SNP array",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [human OmniExpress, human OmniExpressExome]",
  "Source": null,
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "Illumina Infinium OmniExpress, Infinium OmniExpressExome v.1.0, or v.1.2",
  "Genotype Call Methods (software)": "GenCall software（GenomeStudio）",
  "Filtering Methods": "SNPs examined in all of the three versions of array",
  "Marker Number (after QC)": null,
  "NBDC Dataset ID": null,
  "Total Data Volume": "5.3 MB (csv)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000293 (Target Capture)",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "1,005 pancreatic cancer patients (ICD10: C25)\r\n12,503 colorectal cancer patients (ICD10: C18, C19, C20)\r\n740 renal cell cancer patients (ICD10: C64)\r\n1,982 lymphoma patients (ICD10: C81, C82, C83, C84, C85, C86, C88, C91)\r\n10,366 gastric cancer patients (ICD10: C16)\r\n23,705 + 5,996 + 37,592 controls",
  "Targets": "Target Capture",
  "Target Loci for Capture Methods": "27 cancer-predisposing genes (APC, ATM, BARD1, BMPR1A, BRCA1, BRCA2, BRIP1, CDK4, CDKN2A, CDH1, CHEK2, EPCAM, HOXB13, NBN, NF1, MLH1, MSH2, MSH6, MUTYH, PALB2, PMS2, PTEN, RAD51C, RAD51D, SMAD4, STK11, TP53)",
  "Platform": "Illumina [HiSeq 2500]",
  "Source": null,
  "Cell Lines": "-",
  "Reagents (Kit, Version)": null,
  "Genotype Call Methods (software)": null,
  "Filtering Methods": null,
  "Marker Number (after QC)": null,
  "NBDC Dataset ID": null,
  "Total Data Volume": "JGAD000438: 78 GB (fastq)\r\nJGAD000458: 956 GB (fastq)\r\nJGAD000459: 1.9 TB (fastq)\r\nJGAD000531: 961.8 GB (fastq)\r\nJGAD000460: 126 GB (fastq)\r\nJGAD000720, JGAD000721: 3.4 TB (fastq)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000293 (SNP array)",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "740 renal cell cancer patients (ICD10：C64)\r\n5,996 controls",
  "Targets": "Target Capture",
  "Target Loci for Capture Methods": "13 renal cell carcinoma-related genes (VHL, BAP1, FH, FLCN, MET, TSC1, TSC2, MITF, SDHA, SDHB, SDHC, SDHD, CDC73)",
  "Platform": "Illumina [HiSeq 2500]",
  "Source": null,
  "Cell Lines": "-",
  "Reagents (Kit, Version)": null,
  "Genotype Call Methods (software)": null,
  "Filtering Methods": null,
  "Marker Number (after QC)": null,
  "NBDC Dataset ID": null,
  "Total Data Volume": "JGAD000531: 961.8 GB (fastq)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000327 / JGAS000346 / JGAS000414 / JGAS000347 / JGAS000592",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "1,765 myocardial infarction patients (ICD10: I21) and 199 dementia patients (ICD10: F00-03)",
  "Targets": "WGS",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HiSeq X Five]",
  "Source": null,
  "Cell Lines": "-",
  "Reagents (Kit, Version)": null,
  "Genotype Call Methods (software)": null,
  "Filtering Methods": null,
  "Marker Number (after QC)": null,
  "NBDC Dataset ID": null,
  "Total Data Volume": "188.4 TB (fastq, bam, vcf)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000414",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "137,693 individuals from BBJ 1st cohort",
  "Targets": "genome wide variants",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress, HumanExome, OmniExpressExome BeadChip]",
  "Source": "gDNA extracted from peripheral blood cells",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "minimac [imputation (1000 genomes Phase I v3)]\r\nGenCall software (GenomeStudio)",
  "Filtering Methods": "Genotyping QC: sample call rate < 0.98, SNV call rate < 0.99, HWE P < 1 x 10^-6\r\nQC for reference panel:\r\nAfter excluding 11 closely related individuals, variants with HWE P < 1.0 x 10^-6, MAF < 0.01 were excluded.\r\nQC after imputation:\r\nVariants with imputation quality of Rsq < 0.7 were excluded.",
  "Marker Number (after QC)": "6,108,833 variants (hg19)",
  "NBDC Dataset ID": "hum0014.v27.surv.v1\r\n (Click the Dataset ID to download the file)\r\nDictionary file",
  "Total Data Volume": "789 MB (txt.gz)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "JGAS000381",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "WGS data of 4,880 individuals from BBJ 1st cohort\r\n     - WGS data (JGAD000220) of the biobank Japan project (N=1,037)\r\n     - WGS data (JGAD000495) of 1,765 myocardial infarction patients and 199 dementia patients\r\n     - WGS data (AGDD_000005) of 225 gastric cancer patients\r\n- 1,007 individuals from Asian Genome Project\r\n- 617 colorectal cancer patients\r\n- One individual excluded from AGDD_000005 by QC\r\n- 10 individuals excluded from JGAD000220 by QC",
  "Targets": "mobile element variations",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HiSeq X/2500]",
  "Source": null,
  "Cell Lines": "-",
  "Reagents (Kit, Version)": null,
  "Genotype Call Methods (software)": null,
  "Filtering Methods": null,
  "Marker Number (after QC)": null,
  "NBDC Dataset ID": "hum0014.v28.MEs.v1\r\n (Click the Dataset ID to download the file)\r\nDictionary file",
  "Total Data Volume": "1.1 MB (txt.gz)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
{
  "id": "hum0014.v27.surv.v1",
  "NBDC Research ID": "hum0014.v31",
  "Participants/Materials": "77,690 atrial fibrillation patients and 1,167,040 controls\r\n    BBJ: 9,826 atrial fibrillation patients and 140,446 controls\r\n    European: 60,620 atrial fibrillation patients and 970,216 controls\r\n    FinnGen: 7,244 atrial fibrillation patients and 56,378 controls",
  "Targets": "genome wide SNVs",
  "Target Loci for Capture Methods": "-",
  "Platform": "Illumina [HumanOmniExpress、HumanExome、OmniExpressExome BeadChip]",
  "Source": "DNA extracted from peripheral blood cells\r\nEuropean GWAS: http://csg.sph.umich.edu/willer/public/afib2018\r\nFinnGen GWAS: https://www.finngen.fi/en",
  "Cell Lines": "-",
  "Reagents (Kit, Version)": "HumanOmniExpress, HumanExome, OmniExpressExome BeadChip kit",
  "Genotype Call Methods (software)": "GenCall software (GenomeStudio), minimac [imputation (1000 genomes Phase I v3 )]",
  "Filtering Methods": "BBJ GWAS: variants with imputation quality (Rsq) < 0.3 or MAF < 0.001 were excluded\r\nmeta-analysis: variants with MAF < 1% were excluded",
  "Marker Number (after QC)": "BBJ GWAS: 16,817,144 SNPs\r\nmeta-analysis : 5,158,449 SNPs",
  "NBDC Dataset ID": "hum0014.v29.AF.v1\r\n(Click the Dataset ID to download the file)\r\nDictionary file",
  "Total Data Volume": "summary statistics of BBJ: 424 MB (txt)\r\nsummary statistics of meta analysis: 78 MB (txt)\r\npolygenic risk score: 59 KB (txt)",
  "Comments (Policies)": "NBDC policy",
  "lang": "en"
}
```

### PUBLICATIONS
```
%ruby bin/split_publication_each_dataset_from_humandb_both.json.rb json_from_joomla/humandb_20231223_both.json |grep "JGAD000320" |jq
{
  "id": "JGAD000320",
  "NBDC Research ID": "hum0227.v1",
  "Title": "Defined lifestyle and germline factors predispose Asian populations to gastric cancer",
  "DOI": "doi: 10.1126/sciadv.aav9778",
  "Data Set ID": "JGAD000320\r\nJGAD000321\r\nJGAD000322\r\nJGAD000323"
}
{
  "id": "JGAD000321",
  "NBDC Research ID": "hum0227.v1",
  "Title": "Defined lifestyle and germline factors predispose Asian populations to gastric cancer",
  "DOI": "doi: 10.1126/sciadv.aav9778",
  "Data Set ID": "JGAD000320\r\nJGAD000321\r\nJGAD000322\r\nJGAD000323"
}
{
  "id": "JGAD000322",
  "NBDC Research ID": "hum0227.v1",
  "Title": "Defined lifestyle and germline factors predispose Asian populations to gastric cancer",
  "DOI": "doi: 10.1126/sciadv.aav9778",
  "Data Set ID": "JGAD000320\r\nJGAD000321\r\nJGAD000322\r\nJGAD000323"
}
{
  "id": "JGAD000323",
  "NBDC Research ID": "hum0227.v1",
  "Title": "Defined lifestyle and germline factors predispose Asian populations to gastric cancer",
  "DOI": "doi: 10.1126/sciadv.aav9778",
  "Data Set ID": "JGAD000320\r\nJGAD000321\r\nJGAD000322\r\nJGAD000323"
}
{
  "id": "JGAD000320",
  "NBDC Research ID": "hum0226.v1",
  "Title": "Defined lifestyle and germline factors predispose Asian populations to gastric cancer",
  "DOI": "doi: 10.1126/sciadv.aav9778",
  "Data Set ID": "JGAD000320\r\nJGAD000321\r\nJGAD000322\r\nJGAD000323"
}
{
  "id": "JGAD000321",
  "NBDC Research ID": "hum0226.v1",
  "Title": "Defined lifestyle and germline factors predispose Asian populations to gastric cancer",
  "DOI": "doi: 10.1126/sciadv.aav9778",
  "Data Set ID": "JGAD000320\r\nJGAD000321\r\nJGAD000322\r\nJGAD000323"
}
{
  "id": "JGAD000322",
  "NBDC Research ID": "hum0226.v1",
  "Title": "Defined lifestyle and germline factors predispose Asian populations to gastric cancer",
  "DOI": "doi: 10.1126/sciadv.aav9778",
  "Data Set ID": "JGAD000320\r\nJGAD000321\r\nJGAD000322\r\nJGAD000323"
}
{
  "id": "JGAD000323",
  "NBDC Research ID": "hum0226.v1",
  "Title": "Defined lifestyle and germline factors predispose Asian populations to gastric cancer",
  "DOI": "doi: 10.1126/sciadv.aav9778",
  "Data Set ID": "JGAD000320\r\nJGAD000321\r\nJGAD000322\r\nJGAD000323"
}
```

### USERS (Controlled-Access Data)
```
%ruby bin/split_user_each_dataset_from_humandb_both.json.rb json_from_joomla/humandb_20231223_both.json |head -3 |jq
{
  "id": "JGAD000663",
  "NBDC Research ID": "hum0355.v1",
  "Principal Investigator": "Maher Eamonn",
  "Affiliation": "University of Cambridge",
  "Country/Region": null,
  "Research Title": "United Kingdom of Great Britain and Northern Ireland",
  "Data in Use (Dataset ID)": "Molecular Pathology of Human Genetic Disease",
  "Period of Data Use": "JGAD000663"
}
{
  "id": "JGAD000624",
  "NBDC Research ID": "hum0327.v1",
  "Principal Investigator": "Michiaki Hamada",
  "Affiliation": "Faculty of Science and Engineering, Waseda University",
  "Country/Region": null,
  "Research Title": "Japan",
  "Data in Use (Dataset ID)": "Construction of RNA-targeted Drug Discovery Database",
  "Period of Data Use": "JGAD000624"
}
{
  "id": "JGAD000597",
  "NBDC Research ID": "hum0320.v1",
  "Principal Investigator": "Ansuman Satpathy",
  "Affiliation": "Department of Pathology, Stanford University",
  "Country/Region": null,
  "Research Title": "United States of America",
  "Data in Use (Dataset ID)": "Epigenetics of Inflammatory Skin Disorders",
  "Period of Data Use": "JGAD000597"
}
```

### Release Note
TODO
