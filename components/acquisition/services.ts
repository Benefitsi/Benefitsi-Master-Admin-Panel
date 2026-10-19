import {
  loadAcquisitionIndex, loadAcquisitionDocument, saveAcquisitionDocument, createAcquisitionWorkspace,
} from '../../app/partners/acquisition/actions'
import type {ActionResult, Workspace} from '../../lib/workspace/model'
import type {AcquisitionIndex, AcquisitionDocument, AcquisitionTarget} from '../../lib/acquisition/model'

export type AcquisitionServices = {
  loadAcquisitionIndex(): Promise<ActionResult<AcquisitionIndex>>
  loadAcquisitionDocument(target: AcquisitionTarget): Promise<ActionResult<AcquisitionDocument>>
  saveAcquisitionDocument(input: AcquisitionDocument): Promise<ActionResult<AcquisitionDocument>>
  createAcquisitionWorkspace(id: string): Promise<ActionResult<Workspace>>
}
export const acquisitionServices: AcquisitionServices = {
  loadAcquisitionIndex, loadAcquisitionDocument, saveAcquisitionDocument, createAcquisitionWorkspace,
}
