import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

type Analyst = { subject: string; name: string; startsAt: string[]; admin?: boolean };

export function proxyIdentity(token: string, analysts: Analyst[]): RequestHandler {
  const expected = Buffer.from(token);
  const directory = new Map(analysts.map(analyst => [analyst.subject, analyst]));
  return (req, res, next) => {
    const supplied = Buffer.from(req.get('x-handover-proxy-token') ?? '');
    const analyst = directory.get(req.get('x-handover-subject') ?? '');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || !analyst) {
      return res.status(403).json({ error: 'Acesso restrito aos analistas autorizados do NOC.' });
    }
    res.locals.analyst = analyst;
    next();
  };
}
