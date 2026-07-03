import { Octokit } from '@octokit/rest'

import { getTauriGithubAccessToken } from './auth'

const githubApiVersion = '2026-03-10'

export async function createGithubClient() {
  const { accessToken } = await getTauriGithubAccessToken()

  if (!accessToken) {
    throw new Error('GitHub is not connected.')
  }

  return new Octokit({
    auth: accessToken,
    userAgent: 'Clockalong',
    request: {
      headers: {
        'X-GitHub-Api-Version': githubApiVersion,
      },
    },
  })
}
