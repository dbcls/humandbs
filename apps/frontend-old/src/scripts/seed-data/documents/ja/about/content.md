# データ加工について

データ利用者の利便性向上のため、NBDCヒトデータベースに制限公開データとして登録されたデータ（元データ）に対して一定のワークフローにより加工した、アライメントデータ・バリアントコールデータ・統計データを、ヒトデータ審査委員会によって元データの利用を許可されたデータ利用者が希望する場合、加工データも併せて閲覧・利用することを可能にしています。加工データは、元のデータに紐づく形で配置され、Analysis と Datasetのtitleに 「Processed by JGA」と記載されています。 なお、加工データを含む解析結果を論文等で公表する際は、**元データのアクセッション番号を記載して下さい**。

## 加工方法

- **生殖系列の全ゲノムシークエンスデータの加工**
  GATK best practice - Germline short variant discovery（SNPs + Indels）に則り加工しております。詳細は[こちら](https://humandbs.dbcls.jp/whole-genome-sequencing)
  ワークフローのソースコード（jga-analysis）：[https://github.com/ddbj/jga-analysis](https://github.com/ddbj/jga-analysis)

  [加工済みデータ一覧](https://humandbs.dbcls.jp/processed-data-wgs)

- **インピュテーション用の参照パネルデータの加工**
  bcftools（バージョン1.9）ならびに、beagle-bref3（バージョン28Jun21.220）を用いて参照パネルを作成しております。詳細は[こちら](https://humandbs.dbcls.jp/imputation-reference)
  ワークフローのソースコード（imputation-server-wf）：

  - [bcftools-index-t.cwl](https://github.com/ddbj/imputation-server-wf/blob/main/Tools/bcftools-index-t.cwl)
  - [beagle-bref3.cwl](https://github.com/ddbj/imputation-server-wf/blob/main/Tools/beagle-bref3.cwl)

  [加工済みデータ一覧](https://humandbs.dbcls.jp/processed-data-imputation)

なお、DBCLSおよび生命情報・DDBJ センターが実施する当該データ加工において、NBDCヒトデータベースの利用促進活動の目的以外に利用することはありません。
