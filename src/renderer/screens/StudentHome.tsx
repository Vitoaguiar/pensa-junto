import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, MessageCirclePlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { Focus, SessionSummaryDto } from '@shared/types'
import { Button } from '../components/Button'
import { EmptyState } from '../components/Feedback'
import { FocusGlyph, FOCUS_LABEL } from '../components/FocusGlyph'
import { SessionCard } from '../components/SessionCard'
import { BasicModeNotice, StudentHeader } from '../components/StudentChrome'
import { call, errorMessage } from '../lib/api'
import { useApp } from '../store/app'

const FOCI: Array<{ focus: Focus; hint: string }> = [
  { focus: 'add_sub', hint: 'Juntar, tirar, comparar' },
  { focus: 'mul', hint: 'Grupos iguais e fileiras' },
  { focus: 'div', hint: 'Repartir igualzinho' },
  { focus: 'mixed', hint: 'Surpresa!' }
]

export function StudentHome() {
  const student = useApp((s) => s.student)
  const toast = useApp((s) => s.toast)
  const navigate = useNavigate()
  const [sessions, setSessions] = useState<{ active: SessionSummaryDto[]; finished: SessionSummaryDto[] } | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [tab, setTab] = useState<'continuar' | 'terminadas'>('continuar')
  const [creating, setCreating] = useState<Focus | null>(null)

  useEffect(() => {
    if (!student) return
    call('sessions:listByStudent').then(setSessions, () => navigate('/pin'))
  }, [student, navigate])

  if (!student) return <Navigate to="/pin" replace />

  async function start(focus: Focus) {
    setCreating(focus)
    try {
      const session = await call('sessions:create', { focus })
      navigate(`/sessao/${session.id}`)
    } catch (err) {
      toast(errorMessage(err))
      setCreating(null)
    }
  }

  const list = tab === 'continuar' ? sessions?.active : sessions?.finished

  return (
    <div className="flex h-full flex-col">
      <StudentHeader />
      <main className="flex-1 overflow-y-auto px-8 pb-12">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <AnimatePresence mode="wait" initial={false}>
            {!choosing ? (
              <motion.button
                key="new"
                type="button"
                onClick={() => setChoosing(true)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group relative flex min-h-[160px] items-center gap-6 overflow-hidden rounded-card bg-primary px-10 text-left text-white shadow-soft"
              >
                <span aria-hidden className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10" />
                <span aria-hidden className="absolute bottom-[-40px] right-40 h-28 w-28 rotate-12 rounded-[24px] bg-white/10" />
                <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15">
                  <MessageCirclePlus aria-hidden className="h-10 w-10" strokeWidth={2} />
                </span>
                <span>
                  <span className="block text-[34px] font-bold leading-tight">Nova conversa</span>
                  <span className="block text-[20px] text-white/90">Escolha o que você quer praticar hoje</span>
                </span>
              </motion.button>
            ) : (
              <motion.section
                key="choose"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                aria-labelledby="choose-title"
              >
                <div className="mb-4 flex items-center gap-3">
                  <Button variant="ghost" onClick={() => setChoosing(false)} icon={<ArrowLeft aria-hidden className="h-5 w-5" />}>
                    Voltar
                  </Button>
                  <h2 id="choose-title" className="text-[28px] font-bold text-ink">
                    O que vamos praticar?
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  {FOCI.map(({ focus, hint }, i) => (
                    <motion.button
                      key={focus}
                      type="button"
                      autoFocus={i === 0}
                      disabled={!!creating}
                      onClick={() => start(focus)}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex min-h-[132px] items-center gap-5 rounded-card border-2 border-transparent bg-surface px-7 text-left shadow-soft transition-colors hover:border-primary disabled:opacity-60"
                    >
                      <FocusGlyph focus={focus} size={76} />
                      <span>
                        <span className="block text-[24px] font-bold text-ink">{FOCUS_LABEL[focus]}</span>
                        <span className="block text-support text-ink-muted">{creating === focus ? 'Preparando…' : hint}</span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <section aria-label="Suas conversas">
            <div role="tablist" className="mb-4 flex gap-2">
              {(['continuar', 'terminadas'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={[
                    'min-h-target rounded-pill px-6 text-[20px] font-semibold transition-colors',
                    tab === t ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-2'
                  ].join(' ')}
                >
                  {t === 'continuar' ? 'Continuar' : 'Terminadas'}
                  {sessions && (
                    <span className="num ml-2 text-support opacity-80">
                      {t === 'continuar' ? sessions.active.length : sessions.finished.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {sessions &&
              (list && list.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {list.map((s) => (
                    <SessionCard key={s.id} session={s} readOnly={tab === 'terminadas'} onOpen={() => navigate(`/sessao/${s.id}`)} />
                  ))}
                </div>
              ) : tab === 'continuar' ? (
                <EmptyState
                  title="Você ainda não começou nenhuma conversa. Que tal a primeira?"
                  action={<Button onClick={() => setChoosing(true)}>Começar agora</Button>}
                />
              ) : (
                <EmptyState title="As conversas que você terminar aparecem aqui." />
              ))}
          </section>
        </div>
      </main>
      <BasicModeNotice />
    </div>
  )
}
