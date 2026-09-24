import { Stack } from "~/components/base"
import { Answer } from "~/components/form"
import type { Locale } from "~/i18n/locale"

import { useAssistantController } from "./admin-assistant-controller"
import { AssistantReport } from "./admin-assistant-report"
import { AdminAssistantTaskDetail } from "./admin-assistant-task-detail"
import { AdminAssistantTaskList } from "./admin-assistant-task-list"
import { AdminAssistantUploadForm } from "./admin-assistant-upload-form"

export function AssistantContents({ locale }: { locale: Locale }) {
  const controller = useAssistantController(locale)
  return (
    <Stack gap="block">
      {/* What the last request did, over the screen rather than in it: written
          into the page it would push the listing down by its own height. */}
      <Answer answer={controller.notice} locale={locale} said={(notice) => notice.text} ok={(notice) => notice.ok} />
      <AdminAssistantUploadForm
        locale={locale}
        application={controller.application}
        busy={controller.busy}
        words={controller.words}
        onSubmit={(event) => { void controller.submit(event) }}
        onApplicationChange={controller.setApplication}
        onEthicsChange={controller.setEthics}
        onPlanChange={controller.setPlan}
      />
      <AdminAssistantTaskList
        tasks={controller.tasks}
        selectedTaskId={controller.selected?.task_id}
        loading={controller.loading}
        locale={locale}
        words={controller.words}
        onRefresh={() => { void controller.loadTasks() }}
        onSelect={controller.selectTask}
      />
      {controller.selected !== null && (
        <AdminAssistantTaskDetail
          detail={controller.selected}
          locale={locale}
          busy={controller.busy}
          onReanalyze={() => { void controller.reanalyze() }}
        >
          {controller.selected.assessment_data !== null
            && controller.selected.assessment_data !== undefined && (
            <AssistantReport
              report={controller.selected.assessment_data}
              locale={locale}
              words={controller.words}
              applicationType={controller.selected.application_type}
              busy={controller.busy}
              onAddDatasets={controller.addDatasets}
              onRemoveDataset={(datasetId) => {
                void controller.removeDataset(datasetId)
              }}
            />
          )}
        </AdminAssistantTaskDetail>
      )}
    </Stack>
  )
}
