import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, PageShell } from '@/components/shell';
import { Button, Input, Label, Panel } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { saveIdentity } from '@/lib/identity';

export default function DsLogin() {
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.instructorLogin(code, pin);
      saveIdentity(code, { token: r.instructorToken, actor: 'DS', pin });
      navigate(`/ds/${code}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <PageShell>
      <PageHeader kicker="DS · SECOND SCREEN" title="Directing Staff login." sub="Open the DS console on another machine with the session code and instructor PIN." />
      <Panel className="mx-auto max-w-md p-6">
        <form className="grid gap-4" onSubmit={submit}>
          <div>
            <Label htmlFor="ds-code">Session code</Label>
            <Input id="ds-code" maxLength={6} className="font-mono uppercase tracking-[0.25em]" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          </div>
          <div>
            <Label htmlFor="ds-pin">Instructor PIN</Label>
            <Input id="ds-pin" inputMode="numeric" maxLength={6} type="password" className="font-mono tracking-[0.25em]" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
          </div>
          {error && <p role="alert" className="text-sm text-bad">{error}</p>}
          <Button type="submit" variant="primary" disabled={code.length !== 6 || pin.length !== 6}>Open DS console</Button>
        </form>
      </Panel>
    </PageShell>
  );
}
