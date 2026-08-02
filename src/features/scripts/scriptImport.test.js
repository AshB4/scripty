import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { parseScript } from './scriptParser.js'
import {
  IMPORT_ERRORS,
  MAX_SCRIPT_FILE_SIZE,
  getScriptFileType,
  importScriptFile,
} from './scriptImport.js'

const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const validDocxBase64 =
  'UEsDBAoAAAAIAMoyAl15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMECgAAAAAAyjICXQAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMECgAAAAgAyjICXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBAoAAAAAAMoyAl0AAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMECgAAAAgAyjICXdRLSPXKAAAAQwEAABEAAAB3b3JkL2RvY3VtZW50LnhtbIWPTU/DMAyG/0qUO03hgFDVdtplEhdA3RDnkHhtpcaO7LBu/37JOCAhJC6P9frjtd1uzmFRJ2CZCTt9X9VaATryM46dfj/s7p60kmTR24UQOn0B0Zu+XRtP7isAJpUNUJq101NKsTFG3ATBSkURMNeOxMGmLHk0K7GPTA5Esn9YzENdP5pgZ9TF8pP8pcRYwAWpf9kOw/bwOjStKbKQb4y/O59DJE7g1ZEpqI+8qvp3Zg+O0Kto2Y5s4/T3hIBLb2xuie8bzc///RVQSwECFAAKAAAACADKMgJdeW4z1+gAAACtAQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAAoAAAAAAMoyAl0AAAAAAAAAAAAAAAAGAAAAAAAAAAAAEAAAABkBAABfcmVscy9QSwECFAAKAAAACADKMgJdm/036q0AAAApAQAACwAAAAAAAAAAAAAAAAA9AQAAX3JlbHMvLnJlbHNQSwECFAAKAAAAAADKMgJdAAAAAAAAAAAAAAAABQAAAAAAAAAAABAAAAATAgAAd29yZC9QSwECFAAKAAAACADKMgJd1EtI9coAAABDAQAAEQAAAAAAAAAAAAAAAAA2AgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAUABQAgAQAALwMAAAAA'
const emptyDocxBase64 =
  'UEsDBAoAAAAIAM8yAl26d6ScywAAAFMBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbJWQvVLDQAyEX+XmWiYnQ0HB2E4BtEDBC2jOsn3D/c1JCeHtkRNIQUcp7Wq/HfX7U4rmSI1DyYO9dZ3dj/37VyU2qmQe7CpSHwDYr5SQXamUVZlLSyg6tgUq+g9cCO667h58yUJZdrJl2LF/ohkPUczzSdcXSqPI1jxejBtrsFhrDB5FdTjm6Q9l90Nwenn28Boq36jBwti/av0WJjJv2OQFk8bBZ2kTTMUfkiLcZvwXr8xz8HS939JqK56YQ15SdFclYci/PeD8tvEbUEsDBAoAAAAAAM8yAl0AAAAAAAAAAAAAAAAGAAAAX3JlbHMvUEsDBAoAAAAIAM8yAl1fM5VSlQAAAAcBAAALAAAAX3JlbHMvLnJlbHONzzsOwjAMBuCrRD5AnTIwoKZdWLoiLhAlblPRPOSE1+3JwEARA6N///osd8PDr+JGnJcYFLSNhKHvTrTqUoPslpRFbYSswJWSDojZOPI6NzFRqJspsteljjxj0uaiZ8KdlHvkTwO2phitAh5tC+L8TPSPHadpMXSM5uoplB8nvhpV1jxTUXCPbNG+46aygH2Hmxf7F1BLAwQKAAAAAADPMgJdAAAAAAAAAAAAAAAABQAAAHdvcmQvUEsDBAoAAAAIAM8yAl0c71pCeAAAAJcAAAARAAAAd29yZC9kb2N1bWVudC54bWxFjU0OwiAQha/ScIAOunBB+nMFr4CALUmHITNU9PbCwrh5P/mS96b1jcfwCiyR0qwuo1brMlXjyZ0YUhkaTmLqrPZSsgEQtwe0MlIOqbEnMdrSKm9QiX1mckEkpg0PuGp9A7QxqT75IP/pnqGrBFfu3CL8CPxfly9QSwECFAAKAAAACADPMgJduneknMsAAABTAQAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAAoAAAAAAM8yAl0AAAAAAAAAAAAAAAAGAAAAAAAAAAAAEAAAAPwAAABfcmVscy9QSwECFAAKAAAACADPMgJdXzOVUpUAAAAHAQAACwAAAAAAAAAAAAAAAAAgAQAAX3JlbHMvLnJlbHNQSwECFAAKAAAAAADPMgJdAAAAAAAAAAAAAAAABQAAAAAAAAAAABAAAADeAQAAd29yZC9QSwECFAAKAAAACADPMgJdHO9aQngAAACXAAAAEQAAAAAAAAAAAAAAAAABAgAAd29yZC9kb2N1bWVudC54bWxQSwUGAAAAAAUABQAgAQAAqAIAAAAA'

function makeFile(contents, name, type = '') {
  return new File([contents], name, { type })
}

function makeDocx(base64 = validDocxBase64, type = DOCX_MIME_TYPE) {
  return makeFile(Buffer.from(base64, 'base64'), 'sample.docx', type)
}

test('imports TXT text and preserves line boundaries', async () => {
  const text = await importScriptFile(
    makeFile('NARRATOR:\r\nFirst paragraph.\r\n\r\nSecond paragraph.', 'sample.txt', 'text/plain'),
  )

  assert.equal(text, 'NARRATOR:\nFirst paragraph.\n\nSecond paragraph.')
})

test('accepts TXT files with generic or missing MIME types', async () => {
  for (const type of ['', 'application/octet-stream']) {
    assert.equal(
      await importScriptFile(makeFile('Readable text', 'sample.txt', type)),
      'Readable text',
    )
  }
})

test('extracts DOCX paragraphs as plain text', async () => {
  const text = await importScriptFile(makeDocx())

  assert.equal(
    text.trim(),
    'NARRATOR:\n\nImported from Word.\n\nSecond paragraph.',
  )
  assert.equal(typeof text, 'string')
})

test('accepts DOCX files with generic or missing MIME types', async () => {
  for (const type of ['', 'application/octet-stream']) {
    assert.match(await importScriptFile(makeDocx(validDocxBase64, type)), /Imported from Word/)
  }
})

test('rejects unsupported extensions and mismatched MIME types', () => {
  assert.throws(
    () => getScriptFileType(makeFile('pdf', 'sample.pdf', 'application/pdf')),
    { message: IMPORT_ERRORS.unsupported },
  )
  assert.throws(
    () => getScriptFileType(makeFile('fake', 'sample.docx', 'application/pdf')),
    { message: IMPORT_ERRORS.unsupported },
  )
})

test('rejects empty TXT and DOCX files', async () => {
  await assert.rejects(importScriptFile(makeFile('  \n', 'empty.txt')), {
    message: IMPORT_ERRORS.empty,
  })
  await assert.rejects(importScriptFile(makeDocx(emptyDocxBase64)), {
    message: IMPORT_ERRORS.empty,
  })
})

test('handles corrupt or unreadable DOCX files safely', async () => {
  await assert.rejects(importScriptFile(makeDocx('bm90IGEgZG9jeA==')), {
    message: IMPORT_ERRORS.unreadableDocx,
  })
  await assert.rejects(
    importScriptFile({
      arrayBuffer: async () => {
        throw new Error('read denied')
      },
      name: 'protected.docx',
      size: 128,
      type: DOCX_MIME_TYPE,
    }),
    { message: IMPORT_ERRORS.unreadableDocx },
  )
})

test('rejects oversized files before reading them', async () => {
  let wasRead = false
  await assert.rejects(
    importScriptFile({
      name: 'large.txt',
      size: MAX_SCRIPT_FILE_SIZE + 1,
      text: async () => {
        wasRead = true
        return 'large'
      },
      type: 'text/plain',
    }),
    { message: IMPORT_ERRORS.oversized },
  )
  assert.equal(wasRead, false)
})

test('failed imports do not mutate existing script text', async () => {
  const currentScript = 'Keep this script.'

  await assert.rejects(
    importScriptFile(makeFile('unsupported', 'sample.pdf', 'application/pdf')),
  )
  assert.equal(currentScript, 'Keep this script.')
})

test('imported text flows into the parser without retaining the file binary', async () => {
  const text = await importScriptFile(makeDocx())
  const blocks = parseScript(text)

  assert.equal(typeof text, 'string')
  assert.equal(blocks.some((block) => block.speakerId === 'NARRATOR'), true)
  assert.equal(blocks.some((block) => block.text.includes('Imported from Word')), true)
})

test('picker and editor drops route files through the shared workspace handler', async () => {
  const [dropzone, input, workspace] = await Promise.all([
    readFile(new URL('./ScriptDropzone.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./ScriptInput.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./ScriptWorkspace.jsx', import.meta.url), 'utf8'),
  ])

  assert.match(dropzone, /onFileSelected\(file\)/)
  assert.match(input, /onFileSelected\?\.\(file\)/)
  assert.match(workspace, /const text = await importScriptFile\(file\)/)
  assert.doesNotMatch(dropzone, /file\.(text|arrayBuffer)\(/)
  assert.doesNotMatch(input, /file\.(text|arrayBuffer)\(/)
})
