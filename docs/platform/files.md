# Files: attachments and storage

`@elvine-sk/platform-files` stores uploads, checks their type and size, and lets records carry attachments.
`@elvine-sk/platform-files-s3` adds S3 storage. The web template has the attachments card, Administration → Files
and My files.

## Attachments on a record

A module declares which of its records take files with `fileEntities` (list `files` in `dependsOn`):

```ts
import { defineFileEntity } from '@elvine-sk/platform-files'

export const noteFiles = (ctx: () => ModuleContext) =>
  defineFileEntity({
    type: 'note',
    // How file lists name and link the record; `label` is an i18n key or plain text, `link` a web route.
    display: { label: 'notes.entity', icon: 'i-lucide-notebook-pen', link: '/notes/:id' },
    canView: (c, id) => mayOnNote(ctx(), c, 'read', id), // who sees the files
    canAttach: (c, id) => mayOnNote(ctx(), c, 'update', id), // who adds and deletes them
    // Optional: maxSize (bytes, capped by FILES_MAX_BYTES) and accept (MIME types or `image/*`).
  })
```

Return `false` for a record that does not exist.

On the record page, add a tab with the card:

```vue
<PlatformFilesAttachments
  v-if="tab === 'files'"
  entity-type="note"
  :entity-id="note.id"
  @count="(n: number) => (fileCount = n)"
/>
```

The card lists the files, uploads by button or drag and drop with progress and Cancel, refuses files that are
empty, too large or of a type the record does not accept before sending them, previews PNG, JPEG, GIF and WebP
images, downloads, and deletes (for the uploader, anyone who may attach to the record, or `file.manage`).

## Attachments on a create form

A record that does not exist yet has no ID to attach to, so its form uploads drafts and the record claims them
when it is saved.

The field uploads each file with `entityType` alone, under that record type's size and type limits
(`GET /files/limits?entityType=note`). Its `upload` prop says when the files go to the server:

| `upload`            | When files are sent                                      | What the form does                                         |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------------------- |
| `submit`            | When the form saves; until then they wait in the browser | Calls `uploadAll()` first and sends the ids it resolves to |
| `confirm` (default) | When the person presses "Upload N files" under the list  | Sends `v-model` ids; disables submit while `uploading`     |
| `auto`              | As soon as each file is picked                           | Sends `v-model` ids; disables submit while `uploading`     |

Upload on save:

```vue
<script setup lang="ts">
const files = useTemplateRef<{ uploadAll: () => Promise<string[] | null> }>('files')

async function onSubmit() {
  // Uploads what is still waiting, with progress on each row. null: a file failed, its row offers Retry.
  const fileIds = await files.value!.uploadAll()
  if (!fileIds) return
  await create({ ...form, fileIds })
}
</script>

<PlatformFilesDraftAttachments ref="files" entity-type="note" upload="submit" :disabled="saving" />
```

If the record then fails validation, the files stay uploaded in the list and the next `uploadAll()` does not
send them again.

With `confirm` or `auto`, keep the ids and the busy flag instead:

```vue
<PlatformFilesDraftAttachments
  v-model="fileIds"
  entity-type="note"
  upload="confirm"
  :disabled="saving"
  @uploading="(busy: boolean) => (uploading = busy)"
/>
```

The attachments card of an existing record (`PlatformFilesAttachments`) takes `upload="confirm"` (default) or
`"auto"`.

### Upload limits

Whatever the form does, the API limits each person, because the upload route can be called without the form:

- `FILES_UPLOADS_PER_10_MIN` (60): more uploads in 10 minutes answer `429`.
- `FILES_DRAFT_MAX_FILES` (20) and `FILES_DRAFT_MAX_BYTES` (100 MB): uploads not attached to a record yet.
  Over either, an unattached upload answers `409 files.draft_limit` until drafts are attached, removed or
  purged (24 hours). Uploads to a record that exists are not counted.

`files({ uploadsPer10Min, draftLimits: { maxFiles, maxBytes } })` overrides the `.env` values.

In the API, accept the ids on create and attach them in the transaction that creates the record:

```ts
// schema
fileIds: z.array(z.string().uuid()).max(20).default([]),

// route, after authorizing the create
const note = await inTransaction(async () => {
  const created = await createNote(input)
  if (fileIds.length)
    await ctx.services.get(FILES).attachAll(fileIds, 'note', created.id, requireUser(c).user.id)
  return created
})
```

`attachAll` only claims the caller's own unattached uploads; any other id fails validation at `fileIds.<n>`
(`files.not_found`) and the transaction rolls the record back. Drafts of a form that was never saved are
purged after 24 hours; until then their uploader sees them in My files as "Not attached".

## Permissions

- `file.read_all`: Administration → Files, `GET /files/all`, `GET /files/usage`, and downloading any file.
- `file.manage`: delete any file; the Trash view of Administration → Files (`GET /files/trash`), restore a deleted file, delete one permanently and empty the trash (both dialogs ask the person to type "Delete").

No role holds them at first; grant them in the access matrix ("Files"). Everyone has My files (`GET /files/mine`):
their own uploads, marked "Record no longer available" when they can no longer see the record (they can still
delete those).

## Where files are stored

`FILES_STORAGE` in `apps/api/.env` picks the storage:

```env
# Uploads up to FILES_MAX_BYTES (10 MB by default) need a body limit above it
BODY_LIMIT_KB=11264

# Where uploaded files are stored: local | shared | s3
FILES_STORAGE=local
FILES_DIR=storage/files
# shared: a mounted network folder that must already exist, e.g.
# FILES_DIR=/mnt/nas/app-files
# FILES_DIR=\\fileserver\app-files
# s3
# S3_ENDPOINT=http://localhost:9000
# S3_REGION=us-east-1
# S3_BUCKET=app-files
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=
# S3_FORCE_PATH_STYLE=true
```

- `local`: a folder on the API server's disk, created when missing. Fine for one server.
- `shared`: a network folder (NAS, file server) mounted on every API server. The folder must already exist: the
  API checks at startup that it can write, read and delete a probe file in it and refuses to start otherwise,
  naming the folder and the reason. It never creates the folder, and it marks the share with an empty
  `.nelvine-storage` file: every read, write and delete needs that marker, so an unmounted share whose mount point
  is left behind as an empty local folder is refused instead of filling the server's own disk. On first start the
  API writes the marker itself when the folder is a mount point (another disk than its parent) or a UNC path; when
  `FILES_DIR` is a subfolder of the share (`/mnt/nas/app-files` under a share mounted at `/mnt/nas`), create
  the marker once by hand (`touch /mnt/nas/app-files/.nelvine-storage`). If the share goes away while running,
  uploads, downloads and deletes answer 503 `files.storage_unavailable`, the cause goes to the log, and the purge
  retries later.
- `s3`: an S3-compatible bucket (MinIO, RustFS, AWS S3, …). Register `filesS3()` **before** `files()` and merge
  `filesS3ConfigSchema` into `loadConfig` (`nelv add files-s3` does both). The API checks the bucket at startup and
  names the missing variables or the unreachable bucket. Use `S3_FORCE_PATH_STYLE=true` for MinIO and RustFS.

Code wins over `.env`: `files({ storage })` uses that storage whatever `FILES_STORAGE` says.

### Mounting a shared folder

Linux, NFS (`/etc/fstab`):

```
nas.example.lan:/export/app-files  /mnt/nas/app-files  nfs  rw,hard,_netdev  0 0
```

A `hard` mount never returns an error when the server is gone; it waits. The driver gives the share 10 seconds
to answer (`timeoutMs` on `localStorage`), then answers 503 `files.storage_unavailable`, and keeps answering
503 at once until the share responds again. A transfer already under way is not timed.

Linux, SMB/CIFS (`/etc/fstab`, credentials in a root-only file):

```
//fileserver/app-files  /mnt/nas/app-files  cifs  credentials=/etc/app-files.cred,uid=app,gid=app,_netdev  0 0
```

Windows: use the UNC path (`FILES_DIR=\\fileserver\app-files`) and run the API as a service account that may
read and write the share; a mapped drive letter belongs to a logged-in user and is not visible to a service.

### For every storage

- Every API server must use the same folder or bucket, or a file uploaded through one server is missing on the
  others.
- Keep the share and the bucket private: files are only served through the API, which checks access on every
  download.
- Keep `BODY_LIMIT_KB` above `FILES_MAX_BYTES` (plus a little for the multipart envelope), or larger uploads fail
  with 413 before the files module sees them.
- The hourly purge job deletes unattached uploads after 24 hours, deleted files after 30 days, and leftovers of
  interrupted writes in the folder's `.tmp`.

## Developing against S3

Any S3-compatible service works for development (MinIO, RustFS, LocalStack). Create a private bucket and set
`FILES_STORAGE=s3`, `S3_ENDPOINT` (for example `http://localhost:9000`), `S3_BUCKET`, `S3_ACCESS_KEY_ID` and
`S3_SECRET_ACCESS_KEY` in `apps/api/.env`.

## API

| Route                            | Who                                    | What                                                                                                   |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /files`                    | anyone who may attach to the record    | upload (multipart `file`, `entityType`, `entityId`)                                                    |
| `POST /files` without `entityId` | everyone                               | a draft for a new record of `entityType`, under its limits                                             |
| `GET /files/limits?entityType`   | everyone                               | `maxBytes` and `accept` of a record type                                                               |
| `GET /files?entityType&entityId` | anyone who may view the record         | the record's files; `meta` has `canAttach`, `maxBytes`, `accept`                                       |
| `GET /files/{id}/content`        | viewers of the record, `file.read_all` | download; `?inline=1` displays raster images, sandboxed, and opens a PDF in the browser's viewer       |
| `DELETE /files/{id}`             | uploader, attachers, `file.manage`     | delete (kept 30 days, then purged)                                                                     |
| `GET /files/all`                 | `file.read_all`                        | every file, on the platform list query                                                                 |
| `GET /files/mine`                | everyone                               | my uploads, with `available`                                                                           |
| `GET /files/usage`               | `file.read_all`                        | files and bytes, by image / document / other                                                           |
| `GET /files/trash`               | `file.manage`                          | deleted files not purged yet, with who deleted them and `purgeAt`                                      |
| `DELETE /files/trash`            | `file.manage`                          | empties the trash: every deleted file, content first; answers `{ deleted, failed }`                    |
| `GET /files/mine/trash`          | signed in                              | the caller's own uploads that the caller deleted, not purged yet                                       |
| `POST /files/{id}/restore`       | `file.manage`, or the uploader         | puts a deleted file back; without `file.manage` only a file the caller uploaded and deleted themselves |
| `DELETE /files/{id}/permanent`   | `file.manage`                          | removes a deleted file for good now, content first; only a file already in the trash                   |

`/files/all` and `/files/mine` take the usual list parameters: `q` (file name), `sort` (`filename`, `size`,
`createdAt`), and filters such as `filter[contentType][in]=image/png,image/jpeg`,
`filter[entityType][isNull]=true`, `filter[createdAt][gte]=2026-10-01T00:00:00Z` and `filter[createdBy][eq]=<id>`.
