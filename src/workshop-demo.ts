const fileCase = 'CVE-2026-21589'
const host = 'DOCS-01'
const prompt = 'visitor@lab ~ %'
const requestFormat = 'lab request --target <主機> --payload <文件>'

interface ScreenRow {
  text: string
  style?: 'headline' | 'accent' | 'dim'
}

interface Screen {
  title: string
  rows: ScreenRow[]
}

type WorkshopScreens = readonly [Screen, Screen, Screen]

export function workshopDemo(clearHistory: () => void) {
  const events: string[] = []
  let selected = false
  let patched = false
  let lastRequest = ''
  let response: ScreenRow[] = []

  function screens(): WorkshopScreens {
    return [
      {
        title: 'visitor@lab — zsh',
        rows: selected
          ? [
              { text: '登入身分  /  訪客', style: 'dim' },
              { text: requestFormat },
              {
                text: '切換到「目標電腦」可查看主機與文件代號。',
                style: 'dim',
              },
              ...response,
            ]
          : [
              { text: 'CVE 選單', style: 'headline' },
              { text: '[1] ' + fileCase, style: 'accent' },
              { text: '未登入的訪客讀到了內部文件' },
              { text: '輸入 use 1，再按 Enter 開始。' },
              { text: '離線模擬，使用虛構主機與文件。', style: 'dim' },
              ...response,
            ],
      },
      {
        title: 'docs-01 — target',
        rows: [
          { text: '主機代號 / HOST ID', style: 'dim' },
          { text: host, style: 'headline' },
          { text: 'PUBLIC    公開文件 · 營業時間' },
          { text: 'INTERNAL  內部文件 · 維護備忘錄' },
          {
            text: patched ? '已套用模擬修補' : '尚未套用模擬修補',
            style: patched ? 'accent' : 'dim',
          },
        ],
      },
      {
        title: 'lab — event log',
        rows: events.length
          ? events.slice(0, 5).map((text, index) => ({
              text,
              style: index === 0 ? 'accent' : undefined,
            }))
          : [{ text: '等待請求。操作結果會出現在這裡。' }],
      },
    ]
  }

  function report(message: string, event?: string) {
    response.push(
      ...message
        .split('\n')
        .map((text): ScreenRow => ({ text, style: 'accent' })),
    )
    if (event) {
      events.unshift(event)
      if (events.length > 12) events.pop()
    }
  }

  function runRequest(command: string) {
    const match =
      /^lab\s+request\s+--target\s+(\S+)\s+--payload\s+(\S+)$/i.exec(command)
    if (!match) return report('格式有誤。請填入主機與文件代號。')
    const target = match[1]?.toUpperCase()
    const payload = match[2]?.toUpperCase()
    if (target !== host)
      return report('找不到這台主機。按 Esc 再按 2 查看代號。')
    if (payload === 'PUBLIC')
      return report('公開文件｜營業時間 09:00–18:00。', '訪客讀取了公開文件。')
    if (payload !== 'INTERNAL')
      return report('找不到這份文件。請查看目標電腦。')
    if (patched)
      return report(
        '拒絕存取。訪客無法讀取這份內部文件。',
        '系統拒絕了訪客對內部文件的請求。',
      )
    report(
      '讀取成功｜內部文件：測試環境備忘錄\n維護時段為週五 17:00。',
      '訪客讀到了原本僅供員工查看的內部文件。',
    )
  }

  function run(command: string) {
    const instruction = command.toLowerCase()
    if (instruction === 'menu') {
      selected = false
      response = []
    } else if (instruction === 'use 1') {
      selected = true
      response = [{ text: '輸入 help 查看演示指令。', style: 'dim' }]
    } else if (instruction === 'help') {
      report(
        selected
          ? 'patch 套用修補   retry 重送上一筆請求\nreset 重設   menu 回到 CVE 選單'
          : 'use 1 開始演示',
      )
    } else if (!selected) {
      report('先輸入 use 1，選擇要演示的案例。')
    } else if (instruction === 'patch') {
      if (patched) return report('已套用模擬修補。輸入 retry 重試。')
      patched = true
      report('已套用模擬修補。輸入 retry 重送。', '工作室套用了模擬修補。')
    } else if (instruction === 'reset') {
      patched = false
      lastRequest = ''
      clearHistory()
      events.length = 0
      report('演示已重設。')
    } else if (instruction === 'retry') {
      if (lastRequest) runRequest(lastRequest)
      else report('請先送出一筆請求。')
    } else if (instruction.startsWith('lab ')) {
      lastRequest = command
      runRequest(command)
    } else {
      report('找不到這個指令。輸入 help 查看演示指令。')
    }
  }

  return {
    screens,
    submit(command: string) {
      response = [{ text: prompt + ' ' + command, style: 'dim' }]
      run(command)
    },
  }
}
