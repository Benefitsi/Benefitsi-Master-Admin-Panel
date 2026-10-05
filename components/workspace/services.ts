import { loadWorkspaceIndex, loadWorkspacePages, loadWorkspacePage, saveWorkspacePage, saveWorkspace, setWorkspaceFavorite, loadWorkspaceVersions, restoreWorkspacePage, findWorkspacePartners } from '@/app/workspace/actions'
export const workspaceServices={loadWorkspaceIndex,loadWorkspacePages,loadWorkspacePage,saveWorkspacePage,saveWorkspace,setWorkspaceFavorite,loadWorkspaceVersions,restoreWorkspacePage,findWorkspacePartners}
export type WorkspaceServices=typeof workspaceServices
