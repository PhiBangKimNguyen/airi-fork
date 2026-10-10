import JSZip from 'jszip'

import { describe, expect, it } from 'vitest'

import { validateLive2DZip } from './live2d-validator'

function createMoc(version = 5, size = 16): Uint8Array {
  const moc = new Uint8Array(size)
  moc.set([77, 79, 67, 51, version])
  return moc
}

async function createLive2DFile(options: {
  includeMoc?: boolean
  includeUnreferencedResources?: boolean
  includeBasenameCollision?: boolean
  includeMacOSMetadata?: boolean
} = {}): Promise<File> {
  const {
    includeMoc = true,
    includeUnreferencedResources = false,
    includeBasenameCollision = false,
    includeMacOSMetadata = false,
  } = options

  const zip = new JSZip()
  const expressions = includeUnreferencedResources
    ? undefined
    : [
        { Name: 'happy', File: 'expressions/happy.exp3.json' },
        { Name: 'sad', File: 'expressions/sad.exp3.json' },
      ]
  const motions = includeUnreferencedResources
    ? undefined
    : {
        Idle: [
          { File: 'motions/idle.motion3.json' },
          { File: 'motions/wave.motion3.json' },
        ],
      }

  zip.file('model/avatar.model3.json', JSON.stringify({
    Version: 3,
    FileReferences: {
      Moc: 'avatar.moc3',
      Textures: ['textures/texture_00.png'],
      DisplayInfo: 'avatar.cdi3.json',
      Expressions: expressions,
      Motions: motions,
    },
  }))

  if (includeMoc)
    zip.file('model/avatar.moc3', createMoc())

  zip.file('model/textures/texture_00.png', new Uint8Array([1, 2, 3]))
  zip.file('model/avatar.cdi3.json', JSON.stringify({
    Version: 3,
    Parameters: [
      { Id: 'ParamAngleX', Name: 'Angle X' },
      { Id: 'ParamAngleY', Name: 'Angle Y' },
      { Id: 'ParamMouthOpenY', Name: 'Mouth open' },
    ],
  }))
  zip.file('model/expressions/happy.exp3.json', JSON.stringify({
    Type: 'Live2D Expression',
    Parameters: [{ Id: 'ParamEyeLSmile', Value: 1, Blend: 'Add' }],
  }))
  zip.file('model/expressions/sad.exp3.json', JSON.stringify({
    Type: 'Live2D Expression',
    Parameters: [{ Id: 'ParamBrowLY', Value: -1, Blend: 'Add' }],
  }))
  zip.file('model/motions/idle.motion3.json', JSON.stringify({ Version: 3, Curves: [] }))
  zip.file('model/motions/wave.motion3.json', JSON.stringify({ Version: 3, Curves: [] }))

  if (includeBasenameCollision)
    zip.file('model/alternate/texture_00.png', new Uint8Array([4, 5, 6]))

  if (includeMacOSMetadata) {
    zip.file('__MACOSX/model/._avatar.model3.json', new Uint8Array([0, 5, 22, 7]))
    zip.file('__MACOSX/model/expressions/._happy.exp3.json', new Uint8Array([0, 5, 22, 7]))
  }

  const bytes = await zip.generateAsync({ type: 'arraybuffer' })
  return new File([bytes], 'avatar.zip')
}

async function createLooseMocFile(): Promise<File> {
  const zip = new JSZip()
  zip.file('avatar.moc3', createMoc())
  zip.file('texture.png', new Uint8Array([1, 2, 3]))

  const bytes = await zip.generateAsync({ type: 'arraybuffer' })
  return new File([bytes], 'avatar.zip')
}

describe('validateLive2DZip', () => {
  it('accepts a Cubism 2 model.json archive with MOC and MTN resources', async () => {
    const zip = new JSZip()
    zip.file('normal/model.json', JSON.stringify({
      model: 'model.moc',
      textures: ['textures/texture.png'],
      expressions: [{ name: 'smile', file: 'expressions/smile.json' }],
      motions: { idle: [{ file: 'motions/idle.mtn' }] },
    }))
    zip.file('normal/model.moc', new Uint8Array([109, 111, 99, 11, 129, 8]))
    zip.file('normal/textures/texture.png', new Uint8Array([1, 2, 3]))
    zip.file('normal/motions/idle.mtn', '# Live2D Animator Motion Data\n$fps=30\nPARAM_ANGLE_X=0,1,0\n')
    zip.file('normal/expressions/smile.json', JSON.stringify({ params: [{ id: 'PARAM_MOUTH_FORM', val: 1 }] }))
    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const report = await validateLive2DZip(new File([bytes], 'cubism2.zip'))

    expect(report.status).toBe('VALID')
    expect(report.model.type).toBe('model2')
    expect(report.model.entryPoint).toBe('normal/model.json')
    expect(report.model.moc?.version).toBe(11)
    expect(report.resources.expressions).toEqual({ discovered: 1, referenced: 1, parsed: 1 })
    expect(report.resources.motions).toEqual({ discovered: 1, referenced: 1, parsed: 1 })
  })

  it.each([
    ['missing model', undefined, new Uint8Array([109, 111, 99, 11]), 'missing-moc-reference'],
    ['mismatched runtime', 'model.moc', createMoc(), 'invalid-moc-header'],
    ['missing texture', 'model.moc', new Uint8Array([109, 111, 99, 11]), 'missing-reference'],
  ] as const)('rejects Cubism 2 settings with %s', async (reason, modelPath, moc, code) => {
    const zip = new JSZip()
    zip.file('avatar.model.json', JSON.stringify({ model: modelPath, textures: ['texture.png'] }))
    zip.file('model.moc', moc)
    if (reason !== 'missing texture')
      zip.file('texture.png', new Uint8Array([1, 2, 3]))
    const bytes = await zip.generateAsync({ type: 'arraybuffer' })
    const report = await validateLive2DZip(new File([bytes], 'cubism2.zip'))
    expect(report.status).toBe('INVALID')
    expect(report.issues.some(issue => issue.code === code && issue.severity === 'error')).toBe(true)
  })

  it('reports the model type, parsed resources, parameters, and base model data', async () => {
    const report = await validateLive2DZip(await createLive2DFile())

    expect(report.status).toBe('VALID')
    expect(report.model).toEqual({
      type: 'model3',
      entryPoint: 'model/avatar.model3.json',
      archiveFileCount: 8,
      moc: {
        path: 'model/avatar.moc3',
        version: 5,
        size: 16,
      },
    })
    expect(report.resources).toEqual({
      textures: { discovered: 1, referenced: 1 },
      motions: { discovered: 2, referenced: 2, parsed: 2 },
      expressions: { discovered: 2, referenced: 2, parsed: 2 },
      parameters: { parsed: 3, source: 'display-info' },
    })
    expect(report.issues).toEqual([])
  })

  it('reports a loose MOC file as a moc3 model', async () => {
    const report = await validateLive2DZip(await createLooseMocFile())

    expect(report.status).toBe('VALID')
    expect(report.model.type).toBe('moc3')
    expect(report.model.entryPoint).toBeNull()
    expect(report.model.moc?.path).toBe('avatar.moc3')
  })

  it('reports unreferenced expressions and motions as import warnings', async () => {
    const report = await validateLive2DZip(await createLive2DFile({
      includeUnreferencedResources: true,
    }))

    expect(report.status).toBe('WARNING')
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'unreferenced-expressions',
        severity: 'warning',
        message: '2 expression files are not referenced by avatar.model3.json.',
      }),
      expect.objectContaining({
        code: 'unreferenced-motions',
        severity: 'warning',
        message: '2 motion files are not referenced by avatar.model3.json.',
      }),
    ]))
    expect(report.issues.every(issue => issue.resolution.length > 0)).toBe(true)
  })

  it('derives INVALID from an error that blocks model loading', async () => {
    const report = await validateLive2DZip(await createLive2DFile({ includeMoc: false }))

    expect(report.status).toBe('INVALID')
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'missing-reference',
      severity: 'error',
      message: 'The referenced MOC file "avatar.moc3" is missing.',
      resolution: 'Add the file at "model/avatar.moc3", or update the MOC path in avatar.model3.json.',
    }))
  })

  it('keeps same-name files in distinct paths and ignores macOS metadata', async () => {
    const report = await validateLive2DZip(await createLive2DFile({
      includeBasenameCollision: true,
      includeMacOSMetadata: true,
    }))

    expect(report.status).toBe('VALID')
    expect(report.model.archiveFileCount).toBe(9)
    expect(report.resources.expressions.discovered).toBe(2)
    expect(report.issues.map(issue => issue.code)).not.toContain('basename-collision')
    expect(report.issues.some(issue => issue.message.includes('._'))).toBe(false)
  })
})
