# About Data Processing

For the convenience of data users, alignment data, variant call data, and statistical data, which are processed by a certain workflow on data deposited to the NBDC Human Database as controlled-access data (original data), can be used together with the original data if the user who is permitted to use the original data by the Human Data Review Board and wishes to use the processed data as well. The processed data are placed in a way that they are connected to the original data, and are indicated as "Processed by JGA" in the title of the Analysis and Dataset. When publishing analysis results including processed data, please **include the accession number of the original data in the article**.

## How to process the data

- **Whole genome sequencing analysis data (germline)**

  - Data were processed by using of [GATK Best Practice - Germline short variant discovery (SNPs and Indels)](https://humandbs.dbcls.jp/en/whole-genome-sequencing)
  - [Workflow Source Code (jga-analysis)](https://github.com/ddbj/jga-analysis)
  - [List of processed data](https://humandbs.dbcls.jp/en/processed-data-wgs)

- **Imputation reference panel**

  - Reference panels were created by using of [bcftools (version 1.9) and beagle-bref3 (version 28Jun21.220)](https://humandbs.dbcls.jp/en/imputation-reference)
  - Workflow Source Code (imputation-server-wf):

    - [bcftools-index-t.cwl](https://github.com/ddbj/imputation-server-wf/blob/main/Tools/bcftools-index-t.cwl)
    - [beagle-bref3.cwl](https://github.com/ddbj/imputation-server-wf/blob/main/Tools/beagle-bref3.cwl)

  - [List of processed data](https://humandbs.dbcls.jp/en/processed-data-imputation)

In such data processing conducted by the DBCLS and the Bioinformation and DDBJ Center, the data will not be used for any purposes other than those of activities to promote the use of the NBDC human database.
