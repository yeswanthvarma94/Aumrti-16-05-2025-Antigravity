import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function patientToFHIR(p: any, hospital: any) {
  return {
    resourceType: 'Patient',
    id: p.id,
    identifier: [
      { system: 'https://healthid.ndhm.gov.in', value: p.abha_id || '' },
      { system: `urn:hospital:${hospital.id}:uhid`, value: p.uhid || p.id },
    ],
    name: [{ use: 'official', text: p.full_name }],
    telecom: p.phone ? [{ system: 'phone', value: p.phone }] : [],
    gender: p.gender === 'male' ? 'male' : p.gender === 'female' ? 'female' : 'unknown',
    birthDate: p.dob || undefined,
    address: p.address ? [{ text: p.address }] : [],
  };
}

function encounterToFHIR(enc: any, patientId: string) {
  return {
    resourceType: 'Encounter',
    id: enc.id,
    status: enc.status === 'completed' ? 'finished' : 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB', display: 'ambulatory' },
    subject: { reference: `Patient/${patientId}` },
    period: { start: enc.created_at },
    reasonCode: enc.diagnosis ? [{ text: enc.diagnosis }] : [],
  };
}

function conditionToFHIR(enc: any, patientId: string) {
  if (!enc.diagnosis) return null;
  return {
    resourceType: 'Condition',
    id: `cond-${enc.id}`,
    code: {
      coding: enc.icd10_code
        ? [{ system: 'http://hl7.org/fhir/sid/icd-10', code: enc.icd10_code, display: enc.diagnosis }]
        : [],
      text: enc.diagnosis,
    },
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${enc.id}` },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let patientId = url.searchParams.get('patient_id');
    if (!patientId && (req.method === 'POST')) {
      try {
        const body = await req.json();
        patientId = body?.patient_id || null;
      } catch (_) { /* ignore */ }
    }
    if (!patientId) {
      return new Response(JSON.stringify({ error: 'patient_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: patient } = await sb.from('patients').select('*').eq('id', patientId).maybeSingle();
    if (!patient) {
      return new Response(JSON.stringify({ error: 'Patient not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: hospital } = await sb.from('hospitals').select('id, name').eq('id', patient.hospital_id).maybeSingle();
    const { data: encounters } = await sb.from('opd_encounters').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(10);

    const entries: any[] = [];
    entries.push({ resource: patientToFHIR(patient, hospital || { id: 'unknown' }) });
    for (const enc of (encounters || [])) {
      entries.push({ resource: encounterToFHIR(enc, patientId) });
      const condition = conditionToFHIR(enc, patientId);
      if (condition) entries.push({ resource: condition });
    }

    const bundle = {
      resourceType: 'Bundle',
      id: `bundle-${patientId}-${Date.now()}`,
      type: 'document',
      timestamp: new Date().toISOString(),
      entry: entries.map((e) => ({ fullUrl: `urn:uuid:${e.resource.id}`, resource: e.resource })),
    };

    return new Response(JSON.stringify(bundle, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/fhir+json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
