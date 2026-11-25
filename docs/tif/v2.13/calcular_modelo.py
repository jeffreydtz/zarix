"""Modelo prospectivo ZARIX v2.13. Sólo biblioteca estándar; no lee datos personales."""
from pathlib import Path
from decimal import Decimal, ROUND_HALF_UP
import csv, json, math

DEST = Path(__file__).resolve().parent
D = lambda x: Decimal(str(x))
money = lambda x: D(x).quantize(D('.01'), rounding=ROUND_HALF_UP)
count = lambda x: int(D(x).quantize(D('1'), rounding=ROUND_HALF_UP))
annual_rate = .25
monthly_rate = (1 + annual_rate) ** (1 / 12) - 1
profiles = {
    'base': dict(reg=[20,30,50,60,80,100,120,140,160,180,200,220]+list(range(240,461,20)), conversion=.08, churn=.04, collect=.95, mau=.35, ai_util=.50, marketing=25, cloud_mult=1, variable_tax=.05, fixed_tax=30, fee=.06),
    'optimista': dict(reg=[20,30,50,100,140,180,240,300,360,420,480,540]+list(range(600,1261,60)), conversion=.10, churn=.02, collect=.98, mau=.40, ai_util=.60, marketing=40, cloud_mult=1, variable_tax=.05, fixed_tax=30, fee=.06),
    'adverso': dict(reg=[20,30,50,30,40,50,60,60,70,70,80,80]+[80]*12, conversion=.04, churn=.08, collect=.90, mau=.25, ai_util=1, marketing=15, cloud_mult=1.50, variable_tax=.08, fixed_tax=45, fee=.08),
}
PRICE_USD = D('7')
common = dict(currency='USD constantes del momento de evaluación', price_usd=PRICE_USD, launch_month=4, horizon_months=24, annual_discount_real_usd=annual_rate, monthly_discount=monthly_rate,
    ai_model='gemini-2.5-flash', ai_input_per_million=.30, ai_output_per_million=2.50, ai_queries_quota=40, ai_ocr_quota=20, ai_query_input=4000, ai_query_output=800, ai_ocr_input=3000, ai_ocr_output=400, ai_retry_factor=1.25,
    vercel_pro=20, supabase_pro=25, email=3, data_api_budget=15, cloud_import_buffer=.25, accounting=30, operating_other=10, extra_cloud_per_mau=.01,
    domain_initial=18, domain_renewal=18, domain_renewal_months=[12,24], initial_legal_setup=150, initial_test_budget=30, academic_monthly_tools_ai=10,
    support_fee_monthly=200, support_min_premium=100, support_margin_gate=600, support_gate_consecutive_months=3, support_pre_hire_project_cash_gate=600,
    founder_hour_usd=12, founder_hours_m0=80, founder_hours_beta=60, founder_hours_commercial=40, founder_hours_with_support=32,
    commercial_entitlements_proposed=True, forecast_has_no_observed_sales=True, salvage_value=0, receivable_terminal_value=0, debt=0,
    fiscal_note='Provisiones de presupuesto, no alícuotas legales ni encuadre fiscal. Reemplazar con cotización/encuadre confirmado, sin duplicar impuestos integrados al régimen.',
    rounding='Dinero a 2 decimales, cantidades a entero por ROUND_HALF_UP; cada mes usa los importes redondeados del anterior.',
)
ai_quota_cost = ((40*4000+20*3000)*D('.30') + (40*800+20*400)*D('2.50'))/D(1000000)*D('1.25')
assert ai_quota_cost == D('.20750')

def npv(flow, r):
    return sum(float(cf)/((1+r)**t) for t,cf in enumerate(flow))

def irr(flow):
    signs=[1 if x>0 else -1 for x in flow if x]
    changes=sum(a!=b for a,b in zip(signs, signs[1:]))
    if changes==0: return None, 'sin cambio de signo: no existe TIR'
    if changes!=1: return None, 'múltiples cambios de signo: TIR no usada como criterio único'
    lo,hi=-.95,1.0
    # Primero buscar el límite positivo sin desbordar en tasas próximas a -1.
    while npv(flow,hi)>0 and hi<1000: hi*=2
    if npv(flow,lo)*npv(flow,hi)>0: return None, 'sin raíz en intervalo verificado'
    for _ in range(200):
        mid=(lo+hi)/2
        if npv(flow,mid)>0: lo=mid
        else: hi=mid
    return (lo+hi)/2, 'TIR mensual única: un cambio de signo'

all_rows=[]; summaries={}
for name, p in profiles.items():
    assert len(p['reg']) == 24, 'Cada escenario requiere exactamente 24 meses'
    rows=[]; cumulative=D(0); premium=0; registered=0; prev_invoice=D(0); support=False
    initial=money(common['domain_initial']+common['initial_legal_setup']+common['initial_test_budget'])
    rows.append(dict(escenario=name,mes=0,altas_registrados=0,registrados_acumulados=0,mau_estimados=0,altas_premium=0,bajas_premium=0,premium_fin=0,precio_usd=PRICE_USD,facturacion_bruta=0,cobros_brutos=0,comision_cobro=0,hosting_vercel=0,base_supabase=0,email=0,api_cotizaciones=0,ia_tokens=0,colchon_importacion=0,infra_variable=0,administracion=0,marketing=0,otros_operativos=0,provision_fiscal_fija=0,provision_fiscal_variable=0,soporte_contratado=0,dominio=18,puesta_marcha=180,pagos_totales=initial,flujo_proyecto=-initial,acumulado_proyecto=-initial,horas_fundador=80,costo_oportunidad_fundador=960,flujo_economico=-initial-D(960),cuentas_cobrar=0))
    cumulative=-initial
    pre_support_margins=[]
    for m in range(1,25):
        registered+=p['reg'][m-1]
        mau=count(registered*p['mau'])
        gross_add=count(p['reg'][m-2]*p['conversion']) if m>=4 else 0
        churn=count(premium*p['churn']) if m>=4 else 0
        premium=max(0,premium+gross_add-churn)
        assert premium<=registered
        invoice=money(premium*PRICE_USD) if m>=4 else D(0)
        received=money(prev_invoice*D(p['collect']))
        fee=money(received*D(p['fee']))
        commercial=m>=4
        cloud_mult=D(p['cloud_mult'])
        hosting=money(D(20)*cloud_mult) if commercial else D(0)
        db=money(D(25)*cloud_mult) if commercial else D(0)
        email=money(D(3)*cloud_mult) if commercial else D(0)
        data=money(D(15)*cloud_mult) if commercial else D(0)
        ai=money(D(premium)*ai_quota_cost*D(p['ai_util'])) if commercial else D(0)
        cloud_buffer=money((hosting+db+email+ai)*D('.25')) if commercial else D(0)
        extra=money(D(mau)*D('.01')*cloud_mult) if commercial else D(0)
        admin=D(30) if commercial else D(0)
        marketing=D(p['marketing']) if commercial else D(0)
        other=D(10)
        tax_fixed=D(p['fixed_tax']) if commercial else D(0)
        tax_variable=money(received*D(p['variable_tax'])) if commercial else D(0)
        domain=D(18) if m in [12,24] else D(0)
        before_support=money(received-fee-hosting-db-email-data-ai-cloud_buffer-extra-admin-marketing-other-tax_fixed-tax_variable-domain)
        # Sólo se contrata en el mes posterior a 3 márgenes cumplidos; saldo es flujo proyecto conservador, sin financiación.
        if not support and m>=7 and premium>=100 and len(pre_support_margins)>=3 and all(x>=D(600) for x in pre_support_margins[-3:]) and cumulative>=D(600):
            support=True
        support_fee=D(200) if support else D(0)
        total=money(fee+hosting+db+email+data+ai+cloud_buffer+extra+admin+marketing+other+tax_fixed+tax_variable+support_fee+domain)
        flow=money(received-total)
        cumulative=money(cumulative+flow)
        hours=60 if m<=3 else (32 if support else 40)
        opportunity=money(hours*12)
        rows.append(dict(escenario=name,mes=m,altas_registrados=p['reg'][m-1],registrados_acumulados=registered,mau_estimados=mau,altas_premium=gross_add,bajas_premium=churn,premium_fin=premium,precio_usd=PRICE_USD,facturacion_bruta=invoice,cobros_brutos=received,comision_cobro=fee,hosting_vercel=hosting,base_supabase=db,email=email,api_cotizaciones=data,ia_tokens=ai,colchon_importacion=cloud_buffer,infra_variable=extra,administracion=admin,marketing=marketing,otros_operativos=other,provision_fiscal_fija=tax_fixed,provision_fiscal_variable=tax_variable,soporte_contratado=support_fee,dominio=domain,puesta_marcha=0,pagos_totales=total,flujo_proyecto=flow,acumulado_proyecto=cumulative,horas_fundador=hours,costo_oportunidad_fundador=opportunity,flujo_economico=flow-opportunity,cuentas_cobrar=money(invoice*D(p['collect']))))
        pre_support_margins.append(before_support)
        prev_invoice=invoice
    flows=[r['flujo_proyecto'] for r in rows]
    eflows=[r['flujo_economico'] for r in rows]
    minimum=min(r['acumulado_proyecto'] for r in rows)
    base_fixed_m4=money(sum(D(rows[4][k]) for k in ['hosting_vercel','base_supabase','email','api_cotizaciones','administracion','marketing','otros_operativos','provision_fiscal_fija']) + money(sum(D(rows[4][k]) for k in ['hosting_vercel','base_supabase','email'])*D('.25')))
    reserve=money(base_fixed_m4*3)
    funding=D(math.ceil(float(-minimum+reserve)/50)*50)
    cash=D(0)
    for r in rows:
        r['caja_inicial']=cash
        r['aporte_fundador']=funding if r['mes']==0 else D(0)
        cash=money(cash+D(r['aporte_fundador'])+D(r['flujo_proyecto']))
        r['caja_final']=cash
        assert r['caja_final']==money(r['caja_inicial']+r['aporte_fundador']+r['flujo_proyecto'])
        assert r['flujo_proyecto']==money(D(r['cobros_brutos'])-D(r['pagos_totales']))
    ir,irnote=irr(flows); eir,eirnote=irr(eflows)
    if ir is not None: assert abs(npv(flows,ir)) < .00001
    if eir is not None: assert abs(npv(eflows,eir)) < .00001
    cash_payback=next((r['mes'] for r in rows[1:] if r['acumulado_proyecto']>=0),None)
    economic_cum=D(0); economic_payback=None
    for r in rows:
        economic_cum+=r['flujo_economico']
        if r['mes']>0 and economic_cum>=0 and economic_payback is None: economic_payback=r['mes']
    per_premium_ai=ai_quota_cost*D(p['ai_util'])
    contribution=PRICE_USD*D(p['collect'])*(1-D(p['fee'])-D(p['variable_tax'])) - per_premium_ai*D('1.25')
    # Equilibrio de régimen estable para el MAU M12: cuotas cobradas con rezago constante.
    eq_fixed=base_fixed_m4+D(rows[12]['infra_variable'])+D('1.50') # dominio anual equivalente
    eq=math.ceil(float(eq_fixed/contribution))
    eq_after=math.ceil(float((eq_fixed+D(200))/contribution))
    summaries[name]=dict(registered_m12=rows[12]['registrados_acumulados'],registered_m24=registered,premium_m12=rows[12]['premium_fin'],premium_m24=premium,mrr_m12=rows[12]['facturacion_bruta'],mrr_m24=rows[24]['facturacion_bruta'],collections_total=sum(D(r['cobros_brutos']) for r in rows),payments_total=sum(D(r['pagos_totales']) for r in rows),project_cash_accum_m24=cumulative,project_npv=npv(flows,monthly_rate),irr_monthly=ir,irr_annual=(1+ir)**12-1 if ir is not None else None,irr_note=irnote,payback_month=cash_payback,economic_npv=npv(eflows,monthly_rate),economic_irr_monthly=eir,economic_irr_annual=(1+eir)**12-1 if eir is not None else None,economic_irr_note=eirnote,economic_payback=economic_payback,economic_accum_m24=economic_cum,founder_opportunity_total=sum(D(r['costo_oportunidad_fundador']) for r in rows),minimum_project_cash=minimum,three_month_fixed_reserve=reserve,initial_founder_funding=funding,funded_closing_cash=rows[-1]['caja_final'],cash_positive_first_month=next((r['mes'] for r in rows[4:] if r['flujo_proyecto']>=0),None),support_start_month=next((r['mes'] for r in rows if r['soporte_contratado']>0),None),steady_unit_contribution=contribution,break_even_premium_m12_mau_no_support=eq,break_even_premium_m12_mau_with_support=eq_after,npv_sensitivity_annual={str(a):npv(flows,(1+a)**(1/12)-1) for a in [.15,.25,.35,.50]},m24_receivable_not_included_terminal=rows[24]['cuentas_cobrar'])
    all_rows.extend(rows)

def jsonable(obj):
    if isinstance(obj,Decimal): return float(obj)
    raise TypeError(str(type(obj)))
with (DEST/'modelo_financiero.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=list(all_rows[0]));w.writeheader();w.writerows(all_rows)
(DEST/'hipotesis_financieras.json').write_text(json.dumps(dict(common=common,profiles=profiles,ai_full_quota_cost=ai_quota_cost,source_verified_date='2026-10-06',sources=dict(vercel='https://vercel.com/pricing',vercel_hobby='https://vercel.com/docs/plans/hobby',supabase='https://supabase.com/pricing',gemini='https://ai.google.dev/gemini-api/docs/pricing')),ensure_ascii=False,indent=2,default=jsonable),encoding='utf-8')
(DEST/'resultados_financieros.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2,default=jsonable),encoding='utf-8')
print(json.dumps(summaries,ensure_ascii=False,indent=2,default=jsonable))
