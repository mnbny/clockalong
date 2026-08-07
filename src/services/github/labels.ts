import { type GithubSelectedRepository } from '../storage/config'
import { createGithubClient } from './client'

export async function getGithubRepositoryLabels(repository: GithubSelectedRepository) {
  const github = await createGithubClient()
  return github.paginate(github.rest.issues.listLabelsForRepo, {
    owner: repository.owner,
    per_page: 100,
    repo: repository.name,
  })
}
