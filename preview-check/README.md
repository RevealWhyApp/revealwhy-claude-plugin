# RevealWhy preview check

A GitHub Action that asks RevealWhy to test a pull request's preview and says the result on the pull request.
It is a thin connector: the testing happens in RevealWhy, and the action holds no test code. It has no
dependencies and runs on Node 20.

The result is one of three words: `works`, `blocked` or `could_not_tell`. The action writes it as one comment on the
pull request, or in the job summary if it cannot comment. The job fails only when RevealWhy finds a blocked problem.
If RevealWhy cannot tell, or is down, the job passes, so your build never fails over our outage.

## Use it

Copy [examples/revealwhy-check.yml](examples/revealwhy-check.yml) to `.github/workflows/` and change the lines marked
`change me`. In short:

```yaml
- uses: RevealWhyApp/revealwhy-claude-plugin/preview-check@6fbf2a986eef10a8d7ff5b3d941a968ddef9ba22 # 2.10.0
  with:
    revealwhy-key: ${{ secrets.REVEALWHY_KEY }}
    base-url: https://YOUR_REVEALWHY_ADDRESS
    project-id: YOUR_PROJECT_ID
    preview-url: https://pr-${{ github.event.pull_request.number }}.preview.example.com
```

Pin the action to a full commit SHA, as above (not a tag, which can move), and keep the version in a comment after it. Update the SHA when a newer release is shown on this repository's releases page.

| Input | Required | What it is |
|---|---|---|
| `revealwhy-key` | yes | A RevealWhy key that may run tests. Keep it in a repository secret. |
| `project-id` | yes | The ID of your product in RevealWhy. Not a secret. |
| `preview-url` | yes | The address of the preview. It must be under a domain you proved to RevealWhy. |
| `base-url` | yes | RevealWhy's address (https). There is no default, so your key goes only where you point it. |
| `github-token` | no | Used only to write the comment. Defaults to the workflow token. |
| `timeout-minutes` | no | How long to wait for the result, 1 to 60. Default 30. |

Output: `result` (`works`, `blocked` or `could_not_tell`).

## Safety

- The key is masked in the runner log, and every line the action writes is cleaned of it.
- Requests go only to `base-url`, and redirects are never followed, so the key cannot be sent to another host.
- The GitHub token goes only to the GitHub API.
- A pull request from a fork cannot read the secret. The check then writes a note in the job summary that it was skipped.

## Licence

MIT, the same licence as this repository. See [../LICENSE](../LICENSE).
