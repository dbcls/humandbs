---
title: NBDC Guidelines for Human Data Sharing
version: 8.0
updated_at: "2024-04-01"
---

{% version %}
Updated at: {% $frontmatter.updated_at %}

Ver. {% $frontmatter.version %}
{% /version %}

## Introduction

An enormous amount of human data is being generated as advancements are made in analytical techniques such as next-generation sequencing. Rules and systems are therefore needed for storing such data in an organized manner and for effectively utilizing them to make progress in life sciences and to improve public health.

To promote sharing and utilization of human data for the above purposes while considering protection of personal information, [the Department of NBDC Program (hereinafter, NBDC)](https://biosciencedbc.jp/en/) of the Japan Science and Technology Agency (JST) has been operating a platform for sharing various human-related data (hereinafter, the NBDC Human Database). The operational entity of the NBDC Human Database has changed from NBDC to [the Database Center for Life Science (DBCLS)](https://dbcls.rois.ac.jp/index-en.html) / the Joint Support-Center for Data Science Research (DS) of the Research Organization of Information and Systems (ROIS) and from now on DBCLS will operate the database and implement revisions to rules and guidelines (hereinafter, the Guidelines).

The Guidelines are designed to be applied to human data in general that were generated using public funds. Because the relevant guidelines, policies, and laws are amended as necessary to appropriately reflect, the consistency has not been verified between the Guidelines and all of them. In addition, global trends concerning life science data as well as the attitude of the general public toward scientific data are expected to change. To respond to such changes, the Guidelines are reviewed and revised whenever it becomes necessary.

### Contact information:

For information on the Guidelines

Data Sharing Subcommittee Office

[humandbs@dbcls.jp](mailt:humandbs@dbcls.jp)

For information on data use or data submission for the NBDC Human Database

Human Data Review Board Office

[humandbs@dbcls.jp](mailt:humandbs@dbcls.jp)

---

## 1. Principles

1.  The NBDC Human Database is administered toward the following goals.
    - 1: Collecting human data generated using public funds as much as possible
    - 2: Promoting wide sharing of collected data
    - 3: Respecting to the greatest extent possible the rights of individuals who are research subjects
2.  The DBCLS performs the following in administering the NBDC Human Database.
    1.  Maintaining the Guidelines and reexamining them as the need arises
    2.  Reviewing applications for data use and data submission
    3.  Maintaining a means to access data, e.g., website maintenance

## 2. Definitions

1.  Human data
    - Data generated as a result of a study using human-derived specimens. Such data include genomic and genetic information, clinical information, image information, and so on.
2.  Public funds/grants
    - Funds provided by national and local governments, incorporated administrative agencies, and equivalent organizations.
3.  Research subject
    - A person who has provided a sample such as his/her own tissue, blood, and urine, or his/her own data, for an activity such as a study or research project.
4.  Data submitter
    - A principal investigator (hereinafter, PI), who provides human data to the NBDC Human Database.
5.  Data user
    - A PI and his/her research collaborators, who use human data from the NBDC Human Database. Research collaborators must belong to the same organization as the PI, and have been listed as data users in the application for data use filed by the PI.
6.  Principal investigator (PI)
    - An investigator responsible for the study. (The investigator who submitted a research protocol to the Ethical Review Committee of his/her affiliated or an equivalent organization and obtained its approval, or a research collaborator who is listed in the application for the ethical review of the study.)
7.  Unrestricted-access data
    - Data available for use without any access restrictions. Examples include statistical data or reference data previously disclosed in a published paper.
8.  Data accessible to registered users （Registered-access data）
    - Data available to investigators who have been approved by the Human Data Review Board for the usage of controlled-access data, during the data usage period. Included are statistical data created by processing each dataset registered as the controlled-access data at the NBDC Human Database.
9.  Controlled-access data
    - Data available only to investigators for use for research purposes. The access-granted investigators must have research experience in related studies and can use the data for their studies, after clarifying information such as the purpose of data use and data users. For use, approval is required at the review by the Human Data Review Board. Controlled-access data include individual data like nucleotide sequence data containing output from next-generation sequencer, genome-wide variant data, image information, answers to a questionnaire, and so on.
10. Data for future release

    - Data that are planned to be released as unrestricted-access data or controlled-access data after the data submitter makes the results public, e.g., by publication of a paper, acquisition of intellectual property rights, and so on.

11. Secondary data

    - Data that are processed not to be able to restore primary data (controlled-access data shared via NBDC Human Database).

12. Available server outside of affiliated organization (“Off-premise-server”)

    - A server that is not owned by data users’ affiliated organization and that is available to the data users to store and/or process controlled-access data, which “off-premise-server” has a computing environment for analyzing human data. The computing environment is owned by an organization that has concluded with ROIS or DS a memorandum concerning operation including the compliance with the NBDC Security Guidelines for Human Data (for Database Center Operation Managers and “Off-Premise-Server” Operation Managers). In addition, and measures necessary for high level (Type II) security are being implemented in the “off-premise-server.”

13. Entrustee

    - An entity or person who is entrusted by a data user to perform only a part of the work related to a research, such as storage of data or data processing, under the supervision of the data user. When entrusting the work to an entrustee located overseas (outside Japan), the PI at the time of application for data use must implement ethical procedures such as receiving appropriate consent from the research participants and others.

## 3. Acceptable Data

### Overview of acceptable data

The NBDC Human Database accepts a wide range of human data generated in projects that receive public funds. Because this database is aimed for data utilization among many investigators, it cannot be used as a repository for data shared among only limited collaborators of a research group or a consortium. Therefore, data that are provided for such a purpose cannot be accepted.

Data are classified into the following four types according to the state of data release and the level of access restriction (see the figure below).

1.  Unrestricted-access data
2.  Registered-access data
3.  Controlled-access data
4.  Data for future release

The NBDC Human Database accepts: 1) unrestricted-access data, 3) controlled-access data, and 4) data for future release. The NBDC Human Database accepts only these data that have been pseudonymized by the data submitter by replacing a part or all of personal information which enable identification of a specific individual (including a specific deceased individual) with descriptions, e.g., a code or number which is unrelated to the specific individual, and then by assigning another code or number again. Registered-access data (2.) are data created by the database center from the controlled-access data through processing for the purpose of promoting data use.

![dataClassification](/files/dataClassification_6.png)

## 4. Data Submission to the NBDC Human Database

### 4.1 Rights of the Data Submitters

1.  Data submitters can designate data use restrictions that conform to those specified in the informed consent form (e.g., limitation on the scope of diseases for data use).
2.  Data submitters, while being asked to agree with prompt release of their data, can request that the data be designated as data for future release for the purpose of publication of research results, acquisition of intellectual property rights, etc. It is noted, however, the release may be delayed only for a term reasonable and necessary for such purposes. Concrete details are determined in a consultation with the Human Data Review Board.

### 4.2 Responsibilities of Data Submitters

1.  The data submitter must obtain permission from the head of his/her affiliated organization after taking the following steps: (1) Explain the required descriptions in the “Examples of Content for Informed Consent Forms” (shown below) to a research subject from whom the human data are collected; (2) Obtain written consent from the research subject regarding submission of the data to databases and sharing of the data by domestic and/or foreign investigators; and (3) Obtain approval regarding such data submission and data sharing from the Ethical Review Committee of the affiliated or an equivalent organization. However, if the data submission and data sharing were approved for the entire research project after an ethical review conducted at the start point of the project, then another review is not required.
2.  When the data submitter provides data to the NBDC Human Database collected from specimens, e.g., human biological specimens, diagnostic specimens, that were obtained without prior intention to submit such data to databases (e.g., in cases where the informed consent form does not refer to data submission or data sharing), the data submitter must follow procedures that conform to the ethical guidelines that must be complied with in conducting the research (for example, the data submitter obtain re-consent. Alternatively, if it is difficult to do re-consent, he/she must ensure information disclosure and opportunities of rejections (opt-out), and obtain permission from the head of his/her affiliated organization after obtaining approval of the Ethical Review Committee of the affiliated or an equivalent organization).
3.  When the data submitter provides data that is clearly not the subject of "Ethical Guidelines for Medical and Biological Research Involving Human Subjects" <sup>\*[1]</sup> to the NBDC Human Database, the data submitter must submit a "statement requesting a simplified review of an application for data submission" (in an arbitrary format) signed by the PI. Submission of this statement can be a substitute for submission of documents concerning ethics review of the affiliated organization (e.g., research protocol, informed consent form, and notice of approval).

    \*[1]: In "Ethical Guidelines for Medical and Biological Research Involving Human Subjects", specimens and information, the value of which has already been established academically, widely utilized in research and generally available.

4.  While the Human Data Review Board reviews the descriptions of the informed consent form submitted at the time of application for data submission in terms of the consistency with the restrictions on data use, the data submitter is responsible for ensuring that the data are provided in accordance with the conditions of the consent.
5.  The data submitter must provide data according to the content of the "application form for submitting data" to the DBCLS.
6.  The data submitter must confirm that the data to be submitted have been pseudonymized by replacing a part or all of personal information which enables identification of a specific individual (including a specific deceased individual) with descriptions, e.g., a code or number which is unrelated to the specific individual and further by assigning another code or number. In case of withdrawal of consent, in order to delete the data derived from the corresponding research subject, in principle, the data submitter must keep the decoding index.
7.  After selecting the type of data such as unrestricted-access data, controlled-access data, or so on based on consultation with the Human Data Review Board, the data submitter must provide the DBCLS with the data along with any necessary accompanying data (e.g., metadata that explain the main data, as well as information needed for quality control). In addition, for controlled-access data, the data submitter must designate an appropriate security level (Type I or Type II) based on consultation with the Human Data Review Board.
8.  In case the data provided by the data submitter is found to be data that violate the NBDC Human Data Sharing Guidelines etc. or found to be data that contain a defect (including hidden defects) intentionally or with negligence, the DBCLS will suspend publication of the provided data and delete the data. The data submitter must re-provide the data within a certain period of time after fixing data and/or necessary procedures. If re-provided is not done, the DBCLS will cancel the accession number for the data.
9.  When there is a rejection by opt-out or a withdrawal of consent from a research subject from whom the data provided to the NBDC Human Database were derived, the data submitter must cooperate in the disposal of the data in order to avoid subsequent data use.
10. The data submitter shall consent to the processing of the data conducted by the DBCLS and the DDBJ Center for the purpose of improving the convenience of data users (creation of statistical data for the purpose of publishing an overview of the data, and creation of data, such as alignment data, variant call data, and statistical data processed by a specific analysis pipeline, that can be used by a data user who has been approved for data use by the Human Data Review Board if the user so desires).

In case the data submitter provided human data in violation of the NBDC Human Data Sharing Guidelines etc., or provided human data that contain a defect (including hidden defects) intentionally or with negligence, the DBCLS may take one or more further actions such as reporting of the fact to the head of the organization to which the data submitter belongs, announcing of the fact on the website etc., and so on. Besides, the DBCLS may seek compensation from the data submitter, if the DBCLS determines that due to these reasons it has suffered damages such as inability of operation of “the NBDC Human Database” as stated in the section “1. Principles.”

{% callout type="tip" %}
For the description of the security levels (Type I and Type II), see [the NBDC Security Guidelines for Human Data.](/en/guidelines/security-for-users)
{% /callout %}

---

{% callout type="info" %}

### Examples of Content for Informed Consent Forms

### Informed Consent Forms

**Required description:**

- Registration to a database and sharing of research data among many investigators internationally.

* Sample statement: Since the data obtained for this study are also important for other studies which contribute to improved public health, they will be submitted to a public database or the database managed by the Database Center for Life Science (hereinafter, DBCLS) / the Joint Support-Center for Data Science Research of the Research Organization of Information and Systems and will be shared with many investigators internationally.
* Use by a third party in a foreign country (outside Japan).
* Sample statement: It is unknown at this time which countries’ investigators will use the data in the future. However, investigators from any country are required to use the data in accordance with the guidelines of the database that are developed in accordance with the laws and guidelines in Japan.
  **Items desirable for inclusion:**
* Description of the DBCLS
* Sample statement: Aiming for rapid advancement in research, the Database Center for Life Science (hereinafter, DBCLS) / the Joint Support-Center for Data Science Research of the Research Organization of Information and Systems conducts projects in order for broad sharing of various research data and operates public databases that store data obtained from various studies. The NBDC Human Database, one of the databases operated by the DBCLS, aims for rapid development of medical research and others by widely sharing various data on humans while paying attention to the protection of personal information and making full use of valuable data including those from this (our) research. For that reason, we are also promoting not only research use in domestic research institutions but also the use of data for research in private companies such as pharmaceuticals and overseas institutions that contribute to academic research or public health improvement. In the NBDC Human Database, data are managed and released based on strict guidelines that conform to Japanese laws, regulations, and so on. For details, please see the [DBCLS website](https://dbcls.jp/en/).
* The necessity and importance of data sharing
* Sample statement: The sharing of research data with other domestic and/or foreign investigators through a database can help advance related studies overall and can aid in the development of new technologies. Data sharing may contribute to the elucidation of causes of diseases and the development of new treatments and prevention methods, which have not been enabled.
* Data released to the public
* Sample statement: When data obtained from research are released from the database, the access level (controlled-access or unrestricted-access) differs depending on the type of data. Aggregated information, e.g., frequency data/statistical data, that does not lead to the identification of individuals are handled as unrestricted-access data and used by many unspecified persons. The genetic information of individuals is handled as controlled-access data and used by researchers approved for data use after passing through a review on the validity of scientific viewpoint and research system.
* Impossibility to remove data
* Sample statement: When research results have been published in a paper or at an academic conference, even if the consent is withdrawn, the content published in the paper or the conference cannot be withdrawn. In addition, even when data for each individual are published from the public database, your data may not be deleted if your data cannot be identified.

{% /callout %}

### 4.3 Procedure for Data Submission to NBDC Human Database

1.  The data submitter confirms that the responsibilities listed in the above section “4.2 Responsibilities of Data Submitters” are fulfilled.
2.  The data submitter consults and agrees with the Human Data Review Board Office, with regard to the data classification (unrestricted-access data or controlled-access data), the timing of the release in the case of data for future release, and so on.
3.  The data submitter applies for data submission in accordance with [the procedure for data submission application](/en/data-submission). At the time of application, a copy of the research protocol (the application form for ethical review), a copy of the ethical review approval notification, and the informed consent form must be attached. If, however, data submission and data sharing have been approved by an ethical review or equivalent examination held at the beginning of the entire research project, a document indicating that fact may be used instead of a copy of the approval notification.
4.  The Human Data Review Board decides whether the data can be accepted.
5.  When the data submission application is approved, the data submitter prepares the data set to be provided (unrestricted-access data and/or controlled-access data).
6.  The data submitter sends the data with the required accompanying data as instructed by the DBCLS.
7.  Changes to data, such as those due to updating or reclassifying the data, are made as the need arises based on consultation between the data submitter and the Human Data Review Board Office.

## 5. Using Data in the NBDC Human Database

### 5.1 Eligibility for Data Use

#### 5.1.1 Unrestricted-access data

Anyone can use unrestricted-access data.

#### 5.1.2 Registered-access data

Data are available to investigators during the data usage period who have been approved by the Human Data Review Board for the usage of controlled-access data. At the time of registration, the investigator needs to present an e-mail address issued by the organization to which he/she belongs.

1.  An investigator who has research experience (one who belongs to a university, public research institute, private-sector company, or the like, and who has research experience in conducting relevant studies). The use is limited to academic research or research that contributes to the improvement of public health.

#### 5.1.3 Controlled-access Data

An investigator can apply for data use as the PI if he/she satisfies the data user requirements indicated in the limitation added for each data set. When applying for data use, the investigator must present the mail address issued by his/her affiliated organization.

1.  An investigator who has research experience in relevant studies (one who belongs to a university, public research institute, private-sector company, or the like and who has research experience in conducting relevant studies). The use is limited to academic research or research that contributes to the improvement of public health. At the time of application, publications related to the data that the investigator plans to use must be presented.

### 5.2 Rights of Data Users

#### 5.2.1 Unrestricted-access data

1.  Data users can freely make the result of the study for which data from the NBDC Human Database are used public, as long as the responsibilities of data users and the limitation added for each data set are fulfilled.
2.  Data users can freely acquire intellectual property rights based on the result of the study for which data from the NBDC Human Database are used, as long as the responsibilities of data users and the limitation added for each data set are fulfilled.

#### 5.2.2 Registered-access Data

1.  Data users who have completed the registration for registered-access data use can view the data.

#### 5.2.3 Controlled-access Data

1.  Data users can freely make the result of the study for which data from the NBDC Human Database are used public, as long as the responsibilities of data users and the limitation added for each data set are fulfilled.
2.  Data users can freely acquire intellectual property rights based on the result of the study for which data from the NBDC Human Database are used, as long as the responsibilities of data users and the limitation added for each data set are fulfilled.
3.  Data users can download, store, and use the data from the database center in the designated area of an “off-premise-server,” in addition to the data server connected to the affiliated organization LAN.
4.  Data users can use the data processed by the DBCLS and the DDBJ Center (data such as alignment data, variant call data, and statistical data, processed by a specific analysis pipeline).

### 5.3 Responsibilities of Data Users

#### 5.3.1 Unrestricted-access data

1.  In using data, the data user must utilize the data with his/her own responsibility and evaluation of the quality, content, and scientific validity of the data.
2.  The data user must comply with the following rules for the data obtained from the NBDC Human Database as well as any data derived therefrom.

    {% callout type="info" %}
    Basic rules to be complied with in using data

    - The use of data is limited to research and/or development purposes only.
    - The use of data for weapons development or military applications is prohibited. \* Identification of individuals is prohibited. \* The latest data should be downloaded and used.

    {% /callout %}

3.  When the research results including data downloaded from the NBDC Human Databases (the DDBJ Sequence Read Archive, the NBDC Human data Archive, the Genomic Expression Archive, and so on) are made public in a publication or a presentation, the data user must state the accession number of the data set used. In addition, a statement such as the following\*\* must be included as references to the paper in which the data set was originally reported, or as acknowledgments.

    {% callout type="info" %}
    \*\*Example of acknowledgment

    (A part of) The data used for this research was originally obtained by AAAA research project/group led by Prof. /Dr. BBBB and available at the website of the NBDC Human Database of the Database Center for Life Science (DBCLS) / the Joint Support-Center for Data Science Research (DS) of the Research Organization of Information and Systems (ROIS).
    {% /callout %}

#### 5.3.2 Registered-access Data

1.  In using data, the data user must utilize the data with his/her own responsibility and evaluation of the quality, content, and scientific validity of the data.
2.  When conducting research that uses registered-access data, it is necessary to apply for the use of the original data and receive approval from the Human Data Review Board.
3.  The data user must ensure that no one other than the person who has completed the registration to use the registered-access data may view the registered-access data.
4.  When citing registered-access data in a publication or the like, the data user must state the accession number of the data set being cited.

#### 5.3.3 Controlled-access Data

1.  In using data, the data user must utilize the data with his/her own responsibility and evaluation of the quality, content, and scientific validity of the data.
2.  The data user must take full responsibility (including responsibilities to entrustees) for using data. The data user should understand that his/her responsibility will be extended to the head of his/her affiliated organization in case any problem occurs in data management and handling.
3.  When using controlled-access data contained in the NBDC Human Database, the data user must comply with the “Ethical Guidelines for Medical and Biological Research Involving Human Subjects” in Japan. That is, among others, before carrying out any medical or biological research involving human subjects using data obtained from the NBDC Human Database, the data user must prepare the research protocol, go through a review by an Ethical Review Committee of his/her affiliated or an equivalent organization, and obtain approval therefrom and authorization from the head of his/her affiliated organization.
4.  The data user must comply with the following rules for the data obtained from the NBDC Human Database as well as any data derived therefrom.

    {% callout type="info" %}
    Basic rules to be complied with in using data

    - The data users must be limited. (Access is granted only to the PI and his/her research collaborators who belong to the same organization as the PI.)
    - The purpose of data use must be explicitly stated.
    - The use of data for purposes other than those stated in the application is prohibited.
    - The use of data is limited to research and/or development purposes only.
    - The use of data for weapons development or military applications is prohibited.
    - Identification of individuals is prohibited.
    - Redistribution of data is prohibited. (Distribution of processed data with no or very low personal identifiability or primary data recoverability does not constitute redistribution subject to prohibition. However, in principle, an application for retention of secondary data or distribution of processed data is required.)

    {% /callout %}

5.  The data user must securely handle data, complying with the NBDC Security Guidelines for Human Data (for Data Users). Attention should be paid to the fact that the security level to be maintained varies for different data.\* The data user must accept an inspection conducted by the Human Data Review Board or a third party commissioned by the DBCLS with regard to the state of implementation of security measures.

    {% callout type="info" %}

    Security levels: Standard-level (Type I) security is required in principle, but high-level (Type II) security may be required based on consultation between the data submitter and the Human Data Review Board. For details on Type I and Type II security, see [the NBDC Security Guidelines for Human Data (for Data Users)](/en/guidelines/security-for-users).
    {% /callout %}

6.  The data user must establish a security control system depending on the security level (Type I, Type II) and submit "Checklist for the NBDC Security Guidelines for Human Data" to the Human Data Review Board Office in order to demonstrate that the system conforms to the standards set forth by the DBCLS.
7.  The data user must follow the terms of each ”off-premise-server” use in addition to the NBDC Human Data Sharing Guidelines and the NBDC Human Data Security Guidelines when using the ”off-premise-server” for his/her data use.
8.  Should a security incident such as data breach occur, the data user must immediately disconnect relevant devices from the network and report the incident to the DBCLS. The data user must promptly implement post-incident measures, following instructions from the DBCLS. When the “off-premise-server” is used, the data user must immediately take measures according to the terms of use etc.
9.  When the data user is informed of withdrawal of consent, rejection by opt-out in relation to the data that he/she downloaded from the NBDC Human Database and is using, the data user must not use the relevant data thereafter.
10. When finished with using data, the data user must delete all data obtained from the NBDC Human Database (whole data, or any part of the data stored. When the off-premise-server is used, all the data stored on the off-premise-server, including backup data on the off-premise-server.) and all the data that can restore the data in accordance with the NBDC Security Guidelines for Human Data (for backup data on the off-premise-server, confirm when the data will be deleted), and report on the use (and deletion) of the data, using "Reporting on the completion of the data use". With regard to keeping secondary data (e.g., results of calculations or statistical analyses based on controlled-access data) or distribution of processed data with no or very low personal identifiability or primary data recoverability, see the section on the procedure for using controlled-access data (“5.4 Procedure for Data Use”; Subsection “5.4.3 Controlled-access Data”). When the secondary data contains genetic data, the data must be properly managed as personal information and redistribution of the secondary data is prohibited.
11. When the research results including data downloaded from the NBDC Human Databases (the Japanese Genotype-phenotype Archive, the NBDC Human data Archive, and so on) are made public in a publication or a presentation, the data user must state the accession number of the data set used. In addition, a statement such as the following\*\* must be included as a reference to the paper in which the data set was originally reported, or as acknowledgment.

    {% callout type="info" %}
    \*\*Example of acknowledgment

    (A part of) The data used for this research was originally obtained by AAAA research project/group led by Prof. /Dr. BBBB and available at the website of the NBDC Human Database of the Database Center for Life Science (DBCLS) / the Joint Support-Center for Data Science Research (DS) of the Research Organization of Information and Systems (ROIS).
    {% /callout %}

    When the service of JGA was used, it is desirable to refer to the following paper: [Nucleic Acids Res. 2015, 43 Database issue: D18-22.](http://nar.oxfordjournals.org/content/43/D1/D18)

12. The data user agrees that the DBCLS may make certain statistical information or information about data user public upon release of the utilization conditions of the NBDC Human Database. Such information on data user that may be laid open includes the Dataset ID of the data used, the data user’s name, the data user's affiliated organization, country and state, the period of the data use, and the research title.
13. The data user agrees that, for the purpose of release of the utilization conditions of the NBDC Human Database, the DBCLS holds information on data usage, including information on the data users that is obtained from the time of application to the time of reporting the end of data use and information gathered at the time of incidents.

In case the data user used human data in violation of the NBDC Human Data Sharing Guidelines etc., or caused information leakage etc. in using data intentionally or with negligence, the DBCLS may take one or more further actions such as rescinding of permission for data use, reporting of the fact to the head of the organization to which the data user belongs, announcing of the fact on the website etc., and so on. Besides, the DBCLS may seek compensation from the data user, if the DBCLS determines that due to these reasons it has suffered damages such as inability of operation of “the NBDC Human Database” as stated in the section “1. Principles.” The above conditions are applied to not only the PI but also his/her research collaborators. The PI is responsible for his/her research collaborators' compliance with the Guidelines (this document) and [the NBDC Security Guidelines for Human Data (for Data Users)](/en/guidelines/security-guidelines-for-users).

### 5.4 Procedure for Data Use

#### 5.4.1 Unrestricted-access data

The data user can freely use unrestricted-access data available from the website for the NBDC Human Database, as permitted under laws and regulations.

#### 5.4.2 Registered-access Data

1.  Among investigators who have been approved by the Human Data Review Board and are during the data use period, those who wish to use the registered-access data register their investigator information as designated by the DBCLS.
2.  The information necessary to access the data is provided, and the data user can access the data.

#### 5.4.3 Controlled-access Data

1.  The data user applies for data use in accordance with the procedure of application for data use. If multiple investigators from different organizations conduct a collaborative study, an application for data use must be submitted for each organization.
2.  After going through a review by the Ethical Review Committee of his/her affiliated or an equivalent organization with regard to the use of the NBDC Human Database and obtaining approval from the Ethical Review Committee, the data user submits, at the time of application for data use, a copy of a notification of permission obtained from the head of his/her affiliated organization. However, if the Ethical Review Committee decided to waive the review, the data user submits a document such as a notification of the fact.
3.  At the time of application for data use, the data user submits "[Checklist for the NBDC Security Guidelines for Human Data](/files/security_checklist_for_users_e.xlsx)" as well as other information and documents required by the Human Data Review Board.
4.  The Human Data Review Board decides whether access to the controlled-access data may be granted.
5.  After the Human Data Review Board approves the application for data use, the data user is granted access to the data and can access the data.
6.  In principle, the data user reports on data use status every year, using "Reporting on the Use of Controlled-access Data". In addition, at the time of reporting, the data user resubmits "[Checklist for the NBDC Security Guidelines for Human Data](/files/security_checklist_for_users_e.xlsx)".
7.  When the data user plans to distribute processed data with no or very low personal identifiability or primary data recoverability, the data user must apply to the Human Data Review Board Office using the "application for reporting on the completion of data use".
8.  When the data user needs to use the data set beyond the term originally stated in the application for data use, the data user may file an application with the Human Data Review Board Office, at least a month before the original expiration date, with a document such as the approval notification by the Ethical Review Committee of the affiliated organization or an equivalent organization (by which document the term approved can be confirmed) and a statement of desired term to be extended.
9.  When the data use is finished, the data user must promptly delete all data (whole data, or any part of the data stored. When the off-premise-server is used, all the data stored on the off-premise-server, including backup data on the off-premise-server.) and all data that can restore the data according to the NBDC Human Data Security Guidelines (for backup data on the off-premise-server, confirm when the data will be deleted) and report his/her data use (and deletion) to the Human Data Review Board Office, using the "application for reporting on the completion of data use". At the same time, the data user may apply for retention of secondary data (e.g., results of calculations based on controlled-access data) or distribution of processed data with no or very low personal identifiability or primary data recoverability by submitting "keep secondary data derived from controlled-access data" or "distributing processed data" in the "application for reporting on the completion of data use" to the Human Data Review Board Office, and may retain the secondary data. Depending on the degree of data processing and the storage period, however, the application may be rejected.

### 5.5 Cost of Data Use

The data user bears costs incurred in connection with data use, if any (e.g., in cases where data media are needed for sending data or where an ”off-premise-server” is used).

### 5.6 Termination of Data Use

1.  If the data user is suspected of a breach of any of the responsibilities listed in the section “5.3 Responsibilities of Data Users” or the NBDC Security Guidelines for Human Data, the DBCLS investigates the matter. The Human Data Review Board makes a judgement on whether there was any misconduct, based on the result of the investigation, and if it is determined that misconduct occurred, the DBCLS:
    - Orders the data user to stop using the data and revokes the permission to access the data set being used.
    - Do not accept, for a certain period, a new application for data use from the data user who committed the misconduct. This period is determined by the Human Data Review Board.
    - Report the misconduct to the head of the data user's affiliated organization, if necessary.Depending on the situation, termination of data use may be ordered at the stage when suspicion is raised. Upon receiving an order to terminate data use, the data user must immediately delete all data that have been obtained and all secondary data. In addition, the data user must promptly report the state of data deletion to the Human Data Review Board Office, using "Report on the Use (and Deletion) of Controlled-access Data".
2.  In case the data in use are made unavailable due to a breach of the responsibilities of the data submitter, the data users may be requested to stop using the data. In that case, the data users are requested to follow the same procedure as those at the time of data use termination. Regardless of the reason, the DBCLS shall not bear any responsibility for any damage or the like caused by the breach of responsibility of the data submitter.

## 6. Procedure for Revising the Guidelines

### 6.1 Proposal for Revision

Data submitters, data users, and potential users who are considering data use may propose revision of the Guidelines to the Office if they think it may lead to smoother provision or use of human data. It is requested to provide concrete proposals and references to the relevant parts of the Guidelines.

### 6.2 Review of Revision Proposals

Upon receipt of a revision proposal, the Data Sharing Subcommittee promptly reviews its content and decides whether the proposal is adopted or rejected or should be modified.

### 6.3 Announcement and Implementation of a Revision

Once the details of a revision are decided, they are promptly announced on our website and will be implemented after a certain period set by the Data Sharing Subcommittee. It should be noted that the revised Guidelines are also applied to those entities or persons who obtained approval for their application for data submission or data use before the implementation.

## 7. Other Topics

### 7.1 Disclosure of Information Obtained from applications for data submission and data use

From the applications received regarding the NBDC Human Database, the DBCLS discloses some input items for which applicants' consent is obtained. The members of the Human Data Review Board and the staff of the Human Data Review Board Office must not disclose any other information on applications than the information disclosed by the DBCLS to anyone other than those who are concerned.

### 7.2 Notification of Inaccurate Data

The Human Data Review Board accepts notifications about inaccurate data in the NBDC Human Database from data users and informs the relevant data submitters of the issue to discuss the response. Similar actions are taken in cases where people who gave consent point out a possibility of improperly obtained consent or fabricated consent.

Contact information: the Human Data Review Board Office

[humandbs@dbcls.jp](mailt:humandbs@dbcls.jp)

### 7.3 Investigation concerning Research Fraud by Fabrication or Falsification etc.

1.  The DBCLS may cooperate on an investigation of research fraud regarding data stored in the NBDC Human Database, when requested.
2.  The head of the fraud investigation committee etc. should inform the DBCLS of the Dataset ID of data necessary for conducting the verification and the necessity for verification, and report the security status of the server for storing the data using "[Checklist for the NBDC Security Guidelines for Human Data](/files/security_checklist_for_users_e.xlsx)".
3.  The Data should be used under full responsibility of the head of the fraud investigation committee etc.
4.  The head of the fraud investigation committee etc. should comply with rules under “Basic rules to be complied with in using data,” item (4) of “5.3.3 Controlled-access Data” in “5.3 Responsibilities of Data Users.”

## See also:

[The NBDC Security Guidelines for Human Data](/en/guidelines)
