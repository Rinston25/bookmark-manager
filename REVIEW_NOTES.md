# Codzee evaluation notes

Findings from using Codzee, an automated pull request reviewer, on this repository.
Everything below was checked by hand against the code unless it says otherwise.

## 1. Purpose and method

- I built a small Fastify / PostgreSQL / Redis bookmark API to evaluate Codzee on realistic work.
- Some PRs contained **deliberately planted** issues. Each planted issue is scored **caught**, **partial** or **missed**.
- Every other finding Codzee raised was verified by reading the code and marked **valid** or **false positive**.
- I also tested re-review behaviour by pushing fix commits to open PRs and reading the follow-up reports.

## 2. PR history

**PR numbering:** #3 was merged by mistake, reverted in #4, and reopened as #5 for review.

| PR | Title | State | Reviewed by Codzee? |
|----|-------|-------|---------------------|
| #1 | JWT auth | merged | No: merged before Codzee was installed |
| #2 | Service layer and tests | merged | No: merged before Codzee was installed |
| #3 | Redis cache | merged by mistake | No: merged before Codzee was installed |
| #4 | Revert of #3 | merged | No review recorded |
| #5 | Redis cache (reopened #3) | open | Yes, plus two re-reviews |
| #6 | Login rate limit | open | Yes |
| #7 | Review fixes | open | Yes |

- Codzee only reviews PRs **opened after** it was installed. #1-#3 were opened before, so they were never reviewed.
- #5 was also opened before the install. It was reviewed after I commented `@codzee review` on it.
- #4 exists because #3 was merged by mistake. #5 is the same change, reopened.

## 3. PR #1 and #2: planted issues

#1 and #2 were merged before Codzee was installed, so Codzee **never reviewed their diffs**. The tables
below show whether Codzee later flagged each issue while reviewing a different PR (#5, #6 or #7), since it
also reads the surrounding code on `main`. This is based on Codzee's summary comments.
"Not flagged" means no finding appeared there, not that Codzee cannot detect the problem.

**PR #1 (JWT auth)**

| Planted issue | File | Codzee result | Note |
|---------------|------|---------------|------|
| JWT secret hardcoded in source | `src/services/tokens.js` | Not flagged | Moved to an env variable in #7 with no comment. Codzee's only secret finding is the placeholder in `.env.example`, a weakness of the fix. |
| Token expiry not enforced (`ignoreExpiration: true`) | `src/services/tokens.js` | Not flagged | Fixed in #7 with no comment. |
| Password logged on login | `src/routes/auth.js` | Caught (on #6) | Critical, and Codzee said it predates #6. It saw the line because #6 re-indented it. |
| No ownership check on get, update and delete by id | `src/services/bookmarkService.js` | Partial (on #5) | Critical, but only the read path was reported. Update and delete were not mentioned. |

**PR #2 (service layer and tests)**

| Planted issue | File | Codzee result | Note |
|---------------|------|---------------|------|
| SQL injection: search concatenated into the query | `src/services/bookmarkService.js` | Caught (on #5) | Critical. |
| Pagination offset off by one | `src/services/bookmarkService.js` | Caught (on #5) | Major: the first row of every page is skipped. |
| Test that always passes (`deleteBookmark`) | `tests/bookmarkService.test.js` | Not flagged | Replaced in #7 with no comment. |
| Error handler swallows errors and returns 200 | `src/plugins/errorHandler.js` | Partial (on #6) | Raised only as a test gap: production turns validation errors into 200. The handler itself was not called a defect. |

**PR #3 versus #5.** The plan was to compare two reviews of the same Redis code. #3 was never reviewed, so
that comparison is not possible. #5 has the first review, plus two re-reviews of later commits (section 6).

## 4. Unplanted weaknesses

These were not planted, but I expected a thorough reviewer to notice them.

| Weakness | Where | Codzee result | Note |
|----------|-------|---------------|------|
| `KEYS` used instead of `SCAN` | `src/services/cache.js` | Flagged on #5 (Minor) | Fixed in `ca9a811`. |
| Login timing reveals which emails exist | `src/routes/auth.js` | Flagged on #7 (Minor) | Fixed in #6. |
| No rate limiting on login | `src/routes/auth.js` | Not flagged | Added in #6, which Codzee did review. |
| Redis outage breaks every cached read | `src/routes/bookmarks.js` | Not seen in the summaries | Cache errors are not caught. |

## 5. PR #5: planted issues

| Planted issue | File | Result | Severity given |
|---------------|------|--------|----------------|
| List cache key has no user id | `src/services/cache.js` | Caught | Critical |
| List cache key has no page number | `src/services/cache.js` | Partial: user id flagged, page not mentioned | - |
| Update and delete do not invalidate the cache | `src/routes/bookmarks.js` | Caught | Major |
| N+1 tag queries in `listBookmarks` | `src/services/bookmarkService.js` | Caught | Major (explained roughly 102 queries vs 2) |
| Missing `await` on `clearListCache` | `src/routes/bookmarks.js` | Missed | - |

**Score: 3 caught, 1 partial, 1 missed.**

Other valid findings on #5:

- `KEYS` used instead of `SCAN` in `clearListCache` (Minor). This was an unplanted weakness in my code.
- `config.js` accepts invalid TTL values such as `1.5` and `-5`, which cause 500s (Nice to have). This one was not planted.
- Issues in code from merged PRs, outside the diff of #5: SQL injection in search (Critical), missing ownership check on bookmark read (Critical), and the pagination offset skipping the first row (Major). Codzee reviews surrounding code, not only changed lines.

## 6. PR #5: re-review behaviour

| Commit | What it was | Codzee result |
|--------|-------------|---------------|
| `ca9a811` | Fixes for the #5 findings | 5 findings marked fixed (cross-user cache leak, N+1, `KEYS`, stale cache on update/delete, TTL validation). 4 new valid findings, all test gaps in the fix: the fake Redis ignores the TTL, no test asserts `X-Cache: HIT`, the colon-collision test passes without encoding, the PUT 404 path is untested. |
| `9ae7e0c` | Fixes for those 4 test gaps | All 4 marked fixed. 1 new Nice-to-have. |

- Codzee correctly kept the issues that live on `main` open (SQL injection, ownership check, pagination offset), because #5 does not change them.
- Codzee closed findings it had raised itself, which was the purpose of the second commit.
- `ca9a811` also fixed the two issues Codzee had missed or only partly caught (the page number in the cache key and the missing `await`). Codzee did not mention them in its fix report, since it never raised them.

## 7. PR #6 and PR #7: findings

All findings below were checked and are valid.

**PR #6 (login rate limit)**

| Severity | Finding |
|----------|---------|
| Critical | Password is logged on login. Pre-existing on `main`, and Codzee said so. Fixed in #7. |
| Major | The test app skips the error-handler plugin, so the tests expect 400 while production returns 200. |
| Minor | The `Retry-After` test is too weak. |
| Minor | Rate-limit config accepts negative and fractional values. |

**PR #7 (review fixes)**

| Severity | Finding |
|----------|---------|
| Major | The placeholder `JWT_SECRET` in `.env.example` passes the startup check. Confirmed: `config.js` only checks that the value is non-empty. |
| Minor | The log test only spies on `console.log` and `console.info`. |
| Minor | The ownership test does not verify that the user id is bound correctly. |
| Minor | Login timing leak. Fixed in #6. |
| Edge case | Deleted users keep valid tokens until they expire. |

On both PRs, Codzee warned about merge conflicts between #5, #6 and #7. The warning was correct: all three edit overlapping files.

## 8. Overall

**What worked well**

- **No false positives:** every finding across #5, #6 and #7 was valid when checked against the code.
- **Reviews beyond the diff:** on #5 it flagged SQL injection, the missing ownership check and the pagination bug from code already on `main`.
- **Catches weak tests:** it found test gaps in my fix commits (fake Redis ignoring the TTL, no HIT assertion, a colon-collision test that proved nothing) and in #6 (test app missing the error-handler plugin).
- **Catches incomplete fixes:** on #7 it noticed the placeholder `JWT_SECRET` still passes the new startup check.
- **Good re-review behaviour:** it marked its own findings fixed after each commit and kept unrelated `main` issues open.
- **Clear explanations with concrete impact:** for example "about 102 queries instead of 2" for the N+1.
- **Cross-PR awareness:** it warned that #5, #6 and #7 would conflict.
- **Quick acknowledgement and labels:** a 👀 reaction on request and automatic size labels.

**Limits**

- **False positives:** none found across all reviews.
- **Missed:** the missing `await` on `clearListCache`, and the page number in the cache key (partial).
- **Not reviewed:** #1, #2 and #3, which were merged before the install.
- Sample size is small: three reviewed PRs and two re-reviews, one author, one codebase.

## 9. Product issues observed

**Report accuracy**

- Summary counts contradict the findings table on every PR: "1 critical" with 3 critical listed; "4 major" with 2 critical and 2 major; "2 major" with 1 critical and 1 major.
- Open and fixed counts do not reconcile between re-review reports ("7 open", then "4 fixed + 4 open").
- Some comments name extra locations that are missing from the findings table.
- File paths are inconsistent: sometimes with `src/`, sometimes without.

**Status and merge gate**

- "Don't fail the check" appears while Critical findings are open.
- "Changes requested" does not match the merge gate, which only fails on Critical.
- "Blocked" is not enforced unless branch protection is configured. On #5 no status check appeared on the PR.

**Onboarding and visibility**

- PRs opened before the install are silently ignored. The `@codzee review` workaround is only explained on the Codzee dashboard, not on the PR.
- The dashboard showed "Awaiting review: 0" while #5 was open and unreviewed.
- The bot edits the PR description to add its summary.
- Review latency varied: #7 was quick, while #6 took several minutes with only a label showing.

## 10. Next fixes (out of scope for this evaluation)

Open findings from #6 and #7, left as known follow-ups.

**From #6**

- Make the test app register the error-handler plugin, so tests match production status codes.
- Strengthen the `Retry-After` test (assert the value, not just that the header exists).
- Validate rate-limit config: reject negative and fractional values.

**From #7**

- Reject the `.env.example` placeholder `JWT_SECRET`, and require a minimum length.
- Make the log test spy on all console methods and the Fastify logger.
- Make the ownership test prove the user id is bound to the correct query position.
- Decide how deleted users' tokens are handled (check the user on each request, or use shorter expiry).

**Cross-PR**

- Resolve the merge conflicts between #5, #6 and #7 (overlapping edits in `routes/bookmarks.js`, `bookmarkService.js` and `routes/auth.js`).
