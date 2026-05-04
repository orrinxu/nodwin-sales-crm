import { createActor } from "xstate"
import { dealStageMachine, type StageHistoryEntry } from "./deal-stage"
import { toDbInsert, type InsertStageHistoryParams } from "../data/opportunity-stage-history"

export interface PersistStageHistoryFn {
  (params: InsertStageHistoryParams): Promise<void>
}

export interface CreateDealStageActorOptions {
  opportunityId: string
  persistEntry?: PersistStageHistoryFn
  createdBy?: string
}

export function createDealStageActor(options: CreateDealStageActorOptions) {
  const { opportunityId, persistEntry, createdBy } = options

  const actor = createActor(dealStageMachine)

  let previousHistoryLength = 0

  actor.subscribe((snapshot) => {
    const history = snapshot.context.stageHistory
    if (history.length > previousHistoryLength) {
      const newEntries = history.slice(previousHistoryLength)
      previousHistoryLength = history.length

      if (persistEntry) {
        for (const entry of newEntries) {
          persistEntry({
            opportunityId,
            fromStage: entry.from,
            toStage: entry.to,
            event: entry.event,
            reason: entry.reason,
            createdBy,
          }).catch((err) => {
            console.error("Failed to persist stage history entry:", err)
          })
        }
      }
    }
  })

  actor.start()
  return actor
}
