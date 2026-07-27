# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.js >> Accessibility: axe-core WCAG A/AA checks >> Statistics screen: no critical structural axe violations
- Location: tests/e2e/accessibility.spec.js:118:3

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 0
Received length: 2
Received array:  [{"description": "Ensure ARIA attributes are not prohibited for an element's role", "help": "Elements must only use permitted ARIA attributes", "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/aria-prohibited-attr?application=playwright", "id": "aria-prohibited-attr", "impact": "serious", "nodes": [{"all": [], "any": [], "failureSummary": "Fix all of the following:
  aria-label attribute cannot be used on a div with no valid role attribute.", "html": "<div class=\"heatmap-cell level-0\" title=\"2026-04-07: 0 повторений, 0 новых (0 мин)\" aria-label=\"2026-04-07: 0 повторений, 0 новых (0 мин)\"></div>", "impact": "serious", "none": [[Object]], "target": [".heatmap-cell.level-0:nth-child(1)"]}, {"all": [], "any": [], "failureSummary": "Fix all of the following:
  aria-label attribute cannot be used on a div with no valid role attribute.", "html": "<div class=\"heatmap-cell level-0\" title=\"2026-04-08: 0 повторений, 0 новых (0 мин)\" aria-label=\"2026-04-08: 0 повторений, 0 новых (0 мин)\"></div>", "impact": "serious", "none": [[Object]], "target": [".heatmap-cell.level-0:nth-child(2)"]}, {"all": [], "any": [], "failureSummary": "Fix all of the following:
  aria-label attribute cannot be used on a div with no valid role attribute.", "html": "<div class=\"heatmap-cell level-0\" title=\"2026-04-09: 0 повторений, 0 новых (0 мин)\" aria-label=\"2026-04-09: 0 повторений, 0 новых (0 мин)\"></div>", "impact": "serious", "none": [[Object]], "target": [".heatmap-cell.level-0:nth-child(3)"]}, {"all": [], "any": [], "failureSummary": "Fix all of the following:
  aria-label attribute cannot be used on a div with no valid role attribute.", "html": "<div class=\"heatmap-cell level-0\" title=\"2026-04-10: 0 повторений, 0 новых (0 мин)\" aria-label=\"2026-04-10: 0 повторений, 0 новых (0 мин)\"></div>", "impact": "serious", "none": [[Object]], "target": [".heatmap-cell.level-0:nth-child(4)"]}, {"all": [], "any": [], "failureSummary": "Fix all of the following:
  aria-label attribute cannot be used on a div with no valid role attribute.", "html": "<div class=\"heatmap-cell level-0\" title=\"2026-04-11: 0 повторений, 0 новых (0 мин)\" aria-label=\"2026-04-11: 0 повторений, 0 новых (0 мин)\"></div>", "impact": "serious", "none": [[Object]], "target": [".heatmap-cell.level-0:nth-child(5)"]}, {"all": [], "any": [], "failureSummary": "Fix all of the following:
  aria-label attribute cannot be used on a div with no valid role attribute.", "html": "<div class=\"heatmap-cell level-0\" title=\"2026-04-12: 0 повторений, 0 новых (0 мин)\" aria-label=\"2026-04-12: 0 повторений, 0 новых (0 мин)\"></div>", "impact": "serious", "none": [[Object]], "target": [".heatmap-cell.level-0:nth-child(6)"]}, {"all": [], "any": [], "failureSummary": "Fix all of the following:
  aria-label attribute cannot be used on a div with no valid role attribute.", "html": "<div class=\"heatmap-cell level-0\" title=\"2026-04-13: 0 повторений, 0 новых (0 мин)\" aria-label=\"2026-04-13: 0 повторений, 0 новых (0 мин)\"></div>", "impact": "serious", "none": [[Object]], "target": [".heatmap-cell.level-0:nth-child(7)"]}, {"all": [], "any": [], "failureSummary": "Fix all of the following:
  aria-label attribute cannot be used on a div with no valid role attribute.", "html": "<div class=\"heatmap-cell level-0\" title=\"2026-04-14: 0 повторений, 0 новых (0 мин)\" aria-label=\"2026-04-14: 0 повторений, 0 новых (0 мин)\"></div>", "impact": "serious", "none": [[Object]], "target": [".heatmap-cell.level-0:nth-child(8)"]}, {"all": [], "any": [], "failureSummary": "Fix all of the following:
  aria-label attribute cannot be used on a div with no valid role attribute.", "html": "<div class=\"heatmap-cell level-0\" title=\"2026-04-15: 0 повторений, 0 новых (0 мин)\" aria-label=\"2026-04-15: 0 повторений, 0 новых (0 мин)\"></div>", "impact": "serious", "none": [[Object]], "target": [".heatmap-cell.level-0:nth-child(9)"]}, {"all": [], "any": [], "failureSummary": "Fix all of the following:
  aria-label attribute cannot be used on a div with no valid role attribute.", "html": "<div class=\"heatmap-cell level-0\" title=\"2026-04-16: 0 повторений, 0 новых (0 мин)\" aria-label=\"2026-04-16: 0 повторений, 0 новых (0 мин)\"></div>", "impact": "serious", "none": [[Object]], "target": [".heatmap-cell.level-0:nth-child(10)"]}, …], "tags": ["cat.aria", "wcag2a", "wcag412", "EN-301-549", "EN-9.4.1.2", "RGAAv4", "RGAA-7.1.1"]}, {"description": "Ensure elements with an ARIA role that require child roles contain them", "help": "Certain ARIA roles must contain particular children", "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/aria-required-children?application=playwright", "id": "aria-required-children", "impact": "critical", "nodes": [{"all": [], "any": [[Object]], "failureSummary": "Fix any of the following:
  Element has children which are not allowed: div[aria-label]", "html": "<div class=\"heatmap-grid\" role=\"grid\" aria-label=\"Матрица активности по дням\">", "impact": "critical", "none": [], "target": ["div[role=\"grid\"]"]}], "tags": ["cat.aria", "wcag2a", "wcag131", "EN-301-549", "EN-9.1.3.1", "RGAAv4", "RGAA-9.3.1"]}]
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
    - generic [ref=f1e4]:
        - generic [ref=f1e5]:
            - generic [ref=f1e6]:
                - heading "📊 Статистика обучения" [active] [level=1] [ref=f1e7]
                - paragraph [ref=f1e8]: Retention, Lapses, нагрузка и динамика освоения
            - tablist "Выбор периода статистики" [ref=f1e9]:
                - tab "7 дней" [ref=f1e10] [cursor=pointer]
                - tab "30 дней" [selected] [ref=f1e11] [cursor=pointer]
                - tab "90 дней" [ref=f1e12] [cursor=pointer]
                - tab "Всё время" [ref=f1e13] [cursor=pointer]
        - generic [ref=f1e14]:
            - generic [ref=f1e15]:
                - generic [ref=f1e16]: '0'
                - generic [ref=f1e17]: Повторений сегодня
            - generic [ref=f1e18]:
                - generic [ref=f1e19]: '0'
                - generic [ref=f1e20]: Правильных 1-х попыток
            - generic [ref=f1e21]:
                - generic [ref=f1e22]: Недостаточно данных
                - generic [ref=f1e23]: Retention за период
            - generic [ref=f1e24]:
                - generic [ref=f1e25]: —
                - generic [ref=f1e26]: Lapses за период
            - generic [ref=f1e27]:
                - generic [ref=f1e28]: '0'
                - generic [ref=f1e29]: К повторению завтра
            - generic [ref=f1e30]:
                - generic [ref=f1e31]: < 1 мин
                - generic [ref=f1e32]: Прогноз времени завтра
            - generic [ref=f1e33]:
                - generic [ref=f1e34]: '0'
                - generic [ref=f1e35]: Активных карточек
            - generic [ref=f1e36]:
                - generic [ref=f1e37]: 0 / 0
                - generic [ref=f1e38]: Изученных элементов
        - generic [ref=f1e39]:
            - heading "🎯 Retention (Запоминание)" [level=2] [ref=f1e40]
            - paragraph [ref=f1e41]: Retention показывает долю карточек, которые удалось вспомнить с первой попытки.
            - generic [ref=f1e42]:
                - text: 📈
                - paragraph [ref=f1e43]: Недостаточно данных для вычисления Retention
        - generic [ref=f1e44]:
            - heading "⚠️ Lapses и проблемы" [level=2] [ref=f1e45]
            - paragraph [ref=f1e47]: Пока нет истории review lapses
        - generic [ref=f1e48]:
            - heading "⏱️ Учебная нагрузка" [level=2] [ref=f1e49]
            - generic [ref=f1e50]:
                - generic [ref=f1e51]:
                    - generic [ref=f1e52]: '0'
                    - generic [ref=f1e53]: Всего review
                - generic [ref=f1e54]:
                    - generic [ref=f1e55]: 0 мин
                    - generic [ref=f1e56]: Активного времени
                - generic [ref=f1e57]:
                    - generic [ref=f1e58]: —
                    - generic [ref=f1e59]: Медиана ответа
            - generic [ref=f1e60]:
                - heading "Календарь активности (последние 16 недель)" [level=3] [ref=f1e61]
                - grid "Матрица активности по дням" [ref=f1e62]:
                    - 'generic "2026-04-07: 0 повторений, 0 новых (0 мин)" [ref=f1e63]'
                    - 'generic "2026-04-08: 0 повторений, 0 новых (0 мин)" [ref=f1e64]'
                    - 'generic "2026-04-09: 0 повторений, 0 новых (0 мин)" [ref=f1e65]'
                    - 'generic "2026-04-10: 0 повторений, 0 новых (0 мин)" [ref=f1e66]'
                    - 'generic "2026-04-11: 0 повторений, 0 новых (0 мин)" [ref=f1e67]'
                    - 'generic "2026-04-12: 0 повторений, 0 новых (0 мин)" [ref=f1e68]'
                    - 'generic "2026-04-13: 0 повторений, 0 новых (0 мин)" [ref=f1e69]'
                    - 'generic "2026-04-14: 0 повторений, 0 новых (0 мин)" [ref=f1e70]'
                    - 'generic "2026-04-15: 0 повторений, 0 новых (0 мин)" [ref=f1e71]'
                    - 'generic "2026-04-16: 0 повторений, 0 новых (0 мин)" [ref=f1e72]'
                    - 'generic "2026-04-17: 0 повторений, 0 новых (0 мин)" [ref=f1e73]'
                    - 'generic "2026-04-18: 0 повторений, 0 новых (0 мин)" [ref=f1e74]'
                    - 'generic "2026-04-19: 0 повторений, 0 новых (0 мин)" [ref=f1e75]'
                    - 'generic "2026-04-20: 0 повторений, 0 новых (0 мин)" [ref=f1e76]'
                    - 'generic "2026-04-21: 0 повторений, 0 новых (0 мин)" [ref=f1e77]'
                    - 'generic "2026-04-22: 0 повторений, 0 новых (0 мин)" [ref=f1e78]'
                    - 'generic "2026-04-23: 0 повторений, 0 новых (0 мин)" [ref=f1e79]'
                    - 'generic "2026-04-24: 0 повторений, 0 новых (0 мин)" [ref=f1e80]'
                    - 'generic "2026-04-25: 0 повторений, 0 новых (0 мин)" [ref=f1e81]'
                    - 'generic "2026-04-26: 0 повторений, 0 новых (0 мин)" [ref=f1e82]'
                    - 'generic "2026-04-27: 0 повторений, 0 новых (0 мин)" [ref=f1e83]'
                    - 'generic "2026-04-28: 0 повторений, 0 новых (0 мин)" [ref=f1e84]'
                    - 'generic "2026-04-29: 0 повторений, 0 новых (0 мин)" [ref=f1e85]'
                    - 'generic "2026-04-30: 0 повторений, 0 новых (0 мин)" [ref=f1e86]'
                    - 'generic "2026-05-01: 0 повторений, 0 новых (0 мин)" [ref=f1e87]'
                    - 'generic "2026-05-02: 0 повторений, 0 новых (0 мин)" [ref=f1e88]'
                    - 'generic "2026-05-03: 0 повторений, 0 новых (0 мин)" [ref=f1e89]'
                    - 'generic "2026-05-04: 0 повторений, 0 новых (0 мин)" [ref=f1e90]'
                    - 'generic "2026-05-05: 0 повторений, 0 новых (0 мин)" [ref=f1e91]'
                    - 'generic "2026-05-06: 0 повторений, 0 новых (0 мин)" [ref=f1e92]'
                    - 'generic "2026-05-07: 0 повторений, 0 новых (0 мин)" [ref=f1e93]'
                    - 'generic "2026-05-08: 0 повторений, 0 новых (0 мин)" [ref=f1e94]'
                    - 'generic "2026-05-09: 0 повторений, 0 новых (0 мин)" [ref=f1e95]'
                    - 'generic "2026-05-10: 0 повторений, 0 новых (0 мин)" [ref=f1e96]'
                    - 'generic "2026-05-11: 0 повторений, 0 новых (0 мин)" [ref=f1e97]'
                    - 'generic "2026-05-12: 0 повторений, 0 новых (0 мин)" [ref=f1e98]'
                    - 'generic "2026-05-13: 0 повторений, 0 новых (0 мин)" [ref=f1e99]'
                    - 'generic "2026-05-14: 0 повторений, 0 новых (0 мин)" [ref=f1e100]'
                    - 'generic "2026-05-15: 0 повторений, 0 новых (0 мин)" [ref=f1e101]'
                    - 'generic "2026-05-16: 0 повторений, 0 новых (0 мин)" [ref=f1e102]'
                    - 'generic "2026-05-17: 0 повторений, 0 новых (0 мин)" [ref=f1e103]'
                    - 'generic "2026-05-18: 0 повторений, 0 новых (0 мин)" [ref=f1e104]'
                    - 'generic "2026-05-19: 0 повторений, 0 новых (0 мин)" [ref=f1e105]'
                    - 'generic "2026-05-20: 0 повторений, 0 новых (0 мин)" [ref=f1e106]'
                    - 'generic "2026-05-21: 0 повторений, 0 новых (0 мин)" [ref=f1e107]'
                    - 'generic "2026-05-22: 0 повторений, 0 новых (0 мин)" [ref=f1e108]'
                    - 'generic "2026-05-23: 0 повторений, 0 новых (0 мин)" [ref=f1e109]'
                    - 'generic "2026-05-24: 0 повторений, 0 новых (0 мин)" [ref=f1e110]'
                    - 'generic "2026-05-25: 0 повторений, 0 новых (0 мин)" [ref=f1e111]'
                    - 'generic "2026-05-26: 0 повторений, 0 новых (0 мин)" [ref=f1e112]'
                    - 'generic "2026-05-27: 0 повторений, 0 новых (0 мин)" [ref=f1e113]'
                    - 'generic "2026-05-28: 0 повторений, 0 новых (0 мин)" [ref=f1e114]'
                    - 'generic "2026-05-29: 0 повторений, 0 новых (0 мин)" [ref=f1e115]'
                    - 'generic "2026-05-30: 0 повторений, 0 новых (0 мин)" [ref=f1e116]'
                    - 'generic "2026-05-31: 0 повторений, 0 новых (0 мин)" [ref=f1e117]'
                    - 'generic "2026-06-01: 0 повторений, 0 новых (0 мин)" [ref=f1e118]'
                    - 'generic "2026-06-02: 0 повторений, 0 новых (0 мин)" [ref=f1e119]'
                    - 'generic "2026-06-03: 0 повторений, 0 новых (0 мин)" [ref=f1e120]'
                    - 'generic "2026-06-04: 0 повторений, 0 новых (0 мин)" [ref=f1e121]'
                    - 'generic "2026-06-05: 0 повторений, 0 новых (0 мин)" [ref=f1e122]'
                    - 'generic "2026-06-06: 0 повторений, 0 новых (0 мин)" [ref=f1e123]'
                    - 'generic "2026-06-07: 0 повторений, 0 новых (0 мин)" [ref=f1e124]'
                    - 'generic "2026-06-08: 0 повторений, 0 новых (0 мин)" [ref=f1e125]'
                    - 'generic "2026-06-09: 0 повторений, 0 новых (0 мин)" [ref=f1e126]'
                    - 'generic "2026-06-10: 0 повторений, 0 новых (0 мин)" [ref=f1e127]'
                    - 'generic "2026-06-11: 0 повторений, 0 новых (0 мин)" [ref=f1e128]'
                    - 'generic "2026-06-12: 0 повторений, 0 новых (0 мин)" [ref=f1e129]'
                    - 'generic "2026-06-13: 0 повторений, 0 новых (0 мин)" [ref=f1e130]'
                    - 'generic "2026-06-14: 0 повторений, 0 новых (0 мин)" [ref=f1e131]'
                    - 'generic "2026-06-15: 0 повторений, 0 новых (0 мин)" [ref=f1e132]'
                    - 'generic "2026-06-16: 0 повторений, 0 новых (0 мин)" [ref=f1e133]'
                    - 'generic "2026-06-17: 0 повторений, 0 новых (0 мин)" [ref=f1e134]'
                    - 'generic "2026-06-18: 0 повторений, 0 новых (0 мин)" [ref=f1e135]'
                    - 'generic "2026-06-19: 0 повторений, 0 новых (0 мин)" [ref=f1e136]'
                    - 'generic "2026-06-20: 0 повторений, 0 новых (0 мин)" [ref=f1e137]'
                    - 'generic "2026-06-21: 0 повторений, 0 новых (0 мин)" [ref=f1e138]'
                    - 'generic "2026-06-22: 0 повторений, 0 новых (0 мин)" [ref=f1e139]'
                    - 'generic "2026-06-23: 0 повторений, 0 новых (0 мин)" [ref=f1e140]'
                    - 'generic "2026-06-24: 0 повторений, 0 новых (0 мин)" [ref=f1e141]'
                    - 'generic "2026-06-25: 0 повторений, 0 новых (0 мин)" [ref=f1e142]'
                    - 'generic "2026-06-26: 0 повторений, 0 новых (0 мин)" [ref=f1e143]'
                    - 'generic "2026-06-27: 0 повторений, 0 новых (0 мин)" [ref=f1e144]'
                    - 'generic "2026-06-28: 0 повторений, 0 новых (0 мин)" [ref=f1e145]'
                    - 'generic "2026-06-29: 0 повторений, 0 новых (0 мин)" [ref=f1e146]'
                    - 'generic "2026-06-30: 0 повторений, 0 новых (0 мин)" [ref=f1e147]'
                    - 'generic "2026-07-01: 0 повторений, 0 новых (0 мин)" [ref=f1e148]'
                    - 'generic "2026-07-02: 0 повторений, 0 новых (0 мин)" [ref=f1e149]'
                    - 'generic "2026-07-03: 0 повторений, 0 новых (0 мин)" [ref=f1e150]'
                    - 'generic "2026-07-04: 0 повторений, 0 новых (0 мин)" [ref=f1e151]'
                    - 'generic "2026-07-05: 0 повторений, 0 новых (0 мин)" [ref=f1e152]'
                    - 'generic "2026-07-06: 0 повторений, 0 новых (0 мин)" [ref=f1e153]'
                    - 'generic "2026-07-07: 0 повторений, 0 новых (0 мин)" [ref=f1e154]'
                    - 'generic "2026-07-08: 0 повторений, 0 новых (0 мин)" [ref=f1e155]'
                    - 'generic "2026-07-09: 0 повторений, 0 новых (0 мин)" [ref=f1e156]'
                    - 'generic "2026-07-10: 0 повторений, 0 новых (0 мин)" [ref=f1e157]'
                    - 'generic "2026-07-11: 0 повторений, 0 новых (0 мин)" [ref=f1e158]'
                    - 'generic "2026-07-12: 0 повторений, 0 новых (0 мин)" [ref=f1e159]'
                    - 'generic "2026-07-13: 0 повторений, 0 новых (0 мин)" [ref=f1e160]'
                    - 'generic "2026-07-14: 0 повторений, 0 новых (0 мин)" [ref=f1e161]'
                    - 'generic "2026-07-15: 0 повторений, 0 новых (0 мин)" [ref=f1e162]'
                    - 'generic "2026-07-16: 0 повторений, 0 новых (0 мин)" [ref=f1e163]'
                    - 'generic "2026-07-17: 0 повторений, 0 новых (0 мин)" [ref=f1e164]'
                    - 'generic "2026-07-18: 0 повторений, 0 новых (0 мин)" [ref=f1e165]'
                    - 'generic "2026-07-19: 0 повторений, 0 новых (0 мин)" [ref=f1e166]'
                    - 'generic "2026-07-20: 0 повторений, 0 новых (0 мин)" [ref=f1e167]'
                    - 'generic "2026-07-21: 0 повторений, 0 новых (0 мин)" [ref=f1e168]'
                    - 'generic "2026-07-22: 0 повторений, 0 новых (0 мин)" [ref=f1e169]'
                    - 'generic "2026-07-23: 0 повторений, 0 новых (0 мин)" [ref=f1e170]'
                    - 'generic "2026-07-24: 0 повторений, 0 новых (0 мин)" [ref=f1e171]'
                    - 'generic "2026-07-25: 0 повторений, 0 новых (0 мин)" [ref=f1e172]'
                    - 'generic "2026-07-26: 0 повторений, 0 новых (0 мин)" [ref=f1e173]'
                    - 'generic "2026-07-27: 0 повторений, 0 новых (0 мин)" [ref=f1e174]'
        - generic [ref=f1e175]:
            - heading "🔮 Прогноз повторений" [level=2] [ref=f1e176]
            - paragraph [ref=f1e177]: Прогноз основан на текущем расписании карточек. После новых ответов даты могут измениться.
            - generic [ref=f1e178]:
                - generic [ref=f1e179]:
                    - generic [ref=f1e180]: '0'
                    - generic [ref=f1e181]: Due сегодня
                - generic [ref=f1e182]:
                    - generic [ref=f1e183]: '0'
                    - generic [ref=f1e184]: Due завтра
                - generic [ref=f1e185]:
                    - generic [ref=f1e186]: < 1 мин
                    - generic [ref=f1e187]: Время на завтра
                - generic [ref=f1e188]:
                    - generic [ref=f1e189]: '0'
                    - generic [ref=f1e190]: Планируемых новых
            - generic [ref=f1e191]:
                - heading "График повторений на 14 дней" [level=3] [ref=f1e192]
                - generic [ref=f1e193]:
                    - generic [ref=f1e194]:
                        - generic [ref=f1e195]: 2026-07-27
                        - generic [ref=f1e196]: 0 повторений
                        - generic [ref=f1e197]: ≈ < 1 мин
                    - generic [ref=f1e198]:
                        - generic [ref=f1e199]: 2026-07-28
                        - generic [ref=f1e200]: 0 повторений
                        - generic [ref=f1e201]: ≈ < 1 мин
                    - generic [ref=f1e202]:
                        - generic [ref=f1e203]: 2026-07-29
                        - generic [ref=f1e204]: 0 повторений
                        - generic [ref=f1e205]: ≈ < 1 мин
                    - generic [ref=f1e206]:
                        - generic [ref=f1e207]: 2026-07-30
                        - generic [ref=f1e208]: 0 повторений
                        - generic [ref=f1e209]: ≈ < 1 мин
                    - generic [ref=f1e210]:
                        - generic [ref=f1e211]: 2026-07-31
                        - generic [ref=f1e212]: 0 повторений
                        - generic [ref=f1e213]: ≈ < 1 мин
                    - generic [ref=f1e214]:
                        - generic [ref=f1e215]: 2026-08-01
                        - generic [ref=f1e216]: 0 повторений
                        - generic [ref=f1e217]: ≈ < 1 мин
                    - generic [ref=f1e218]:
                        - generic [ref=f1e219]: 2026-08-02
                        - generic [ref=f1e220]: 0 повторений
                        - generic [ref=f1e221]: ≈ < 1 мин
                    - generic [ref=f1e222]:
                        - generic [ref=f1e223]: 2026-08-03
                        - generic [ref=f1e224]: 0 повторений
                        - generic [ref=f1e225]: ≈ < 1 мин
                    - generic [ref=f1e226]:
                        - generic [ref=f1e227]: 2026-08-04
                        - generic [ref=f1e228]: 0 повторений
                        - generic [ref=f1e229]: ≈ < 1 мин
                    - generic [ref=f1e230]:
                        - generic [ref=f1e231]: 2026-08-05
                        - generic [ref=f1e232]: 0 повторений
                        - generic [ref=f1e233]: ≈ < 1 мин
                    - generic [ref=f1e234]:
                        - generic [ref=f1e235]: 2026-08-06
                        - generic [ref=f1e236]: 0 повторений
                        - generic [ref=f1e237]: ≈ < 1 мин
                    - generic [ref=f1e238]:
                        - generic [ref=f1e239]: 2026-08-07
                        - generic [ref=f1e240]: 0 повторений
                        - generic [ref=f1e241]: ≈ < 1 мин
                    - generic [ref=f1e242]:
                        - generic [ref=f1e243]: 2026-08-08
                        - generic [ref=f1e244]: 0 повторений
                        - generic [ref=f1e245]: ≈ < 1 мин
                    - generic [ref=f1e246]:
                        - generic [ref=f1e247]: 2026-08-09
                        - generic [ref=f1e248]: 0 повторений
                        - generic [ref=f1e249]: ≈ < 1 мин
        - generic [ref=f1e250]:
            - heading "🧠 Статистика по навыкам" [level=2] [ref=f1e251]
            - generic [ref=f1e252]:
                - generic [ref=f1e253]:
                    - generic [ref=f1e254]:
                        - generic [ref=f1e255]: Recognition (Распознавание)
                        - generic [ref=f1e256]: Навык ещё не открыт
                    - generic [ref=f1e257]:
                        - generic [ref=f1e258]:
                            - text: 'Карточек:'
                            - strong [ref=f1e259]: '0'
                        - generic [ref=f1e260]:
                            - text: 'Retention:'
                            - strong [ref=f1e261]: Недостаточно данных
                        - generic [ref=f1e262]:
                            - text: 'Lapses:'
                            - strong [ref=f1e263]: '0'
                        - generic [ref=f1e264]:
                            - text: 'Медиана время:'
                            - strong [ref=f1e265]: —
                        - generic [ref=f1e266]:
                            - text: 'Доступность:'
                            - strong [ref=f1e267]: 0%
                        - generic [ref=f1e268]:
                            - text: 'Evidence:'
                            - strong [ref=f1e269]: 0%
                - generic [ref=f1e270]:
                    - generic [ref=f1e271]:
                        - generic [ref=f1e272]: Recall (Воспроизведение)
                        - generic [ref=f1e273]: Навык ещё не открыт
                    - generic [ref=f1e274]:
                        - generic [ref=f1e275]:
                            - text: 'Карточек:'
                            - strong [ref=f1e276]: '0'
                        - generic [ref=f1e277]:
                            - text: 'Retention:'
                            - strong [ref=f1e278]: Недостаточно данных
                        - generic [ref=f1e279]:
                            - text: 'Lapses:'
                            - strong [ref=f1e280]: '0'
                        - generic [ref=f1e281]:
                            - text: 'Медиана время:'
                            - strong [ref=f1e282]: —
                        - generic [ref=f1e283]:
                            - text: 'Доступность:'
                            - strong [ref=f1e284]: 0%
                        - generic [ref=f1e285]:
                            - text: 'Evidence:'
                            - strong [ref=f1e286]: 0%
                - generic [ref=f1e287]:
                    - generic [ref=f1e288]:
                        - generic [ref=f1e289]: Reading & Writing (Чтение/Письмо)
                        - generic [ref=f1e290]: Навык ещё не открыт
                    - generic [ref=f1e291]:
                        - generic [ref=f1e292]:
                            - text: 'Карточек:'
                            - strong [ref=f1e293]: '0'
                        - generic [ref=f1e294]:
                            - text: 'Retention:'
                            - strong [ref=f1e295]: Недостаточно данных
                        - generic [ref=f1e296]:
                            - text: 'Lapses:'
                            - strong [ref=f1e297]: '0'
                        - generic [ref=f1e298]:
                            - text: 'Медиана время:'
                            - strong [ref=f1e299]: —
                        - generic [ref=f1e300]:
                            - text: 'Доступность:'
                            - strong [ref=f1e301]: 0%
                        - generic [ref=f1e302]:
                            - text: 'Evidence:'
                            - strong [ref=f1e303]: 0%
                - generic [ref=f1e304]:
                    - generic [ref=f1e305]:
                        - generic [ref=f1e306]: Context-Production (Использование в контексте)
                        - generic [ref=f1e307]: Задание для навыка недоступно
                    - generic [ref=f1e308]:
                        - generic [ref=f1e309]:
                            - text: 'Карточек:'
                            - strong [ref=f1e310]: '0'
                        - generic [ref=f1e311]:
                            - text: 'Retention:'
                            - strong [ref=f1e312]: Недостаточно данных
                        - generic [ref=f1e313]:
                            - text: 'Lapses:'
                            - strong [ref=f1e314]: '0'
                        - generic [ref=f1e315]:
                            - text: 'Медиана время:'
                            - strong [ref=f1e316]: —
                        - generic [ref=f1e317]:
                            - text: 'Доступность:'
                            - strong [ref=f1e318]: 0%
                        - generic [ref=f1e319]:
                            - text: 'Evidence:'
                            - strong [ref=f1e320]: 0%
        - generic [ref=f1e321]:
            - heading "🏆 Распределение Mastery (Освоение)" [level=2] [ref=f1e322]
            - generic [ref=f1e323]:
                - generic [ref=f1e324]:
                    - generic [ref=f1e325]: Новое (0)
                    - generic [ref=f1e327]: 0%
                - generic [ref=f1e328]:
                    - generic [ref=f1e329]: Знакомо (0)
                    - generic [ref=f1e331]: 0%
                - generic [ref=f1e332]:
                    - generic [ref=f1e333]: Вспоминаю (0)
                    - generic [ref=f1e335]: 0%
                - generic [ref=f1e336]:
                    - generic [ref=f1e337]: Уверенно (0)
                    - generic [ref=f1e339]: 0%
                - generic [ref=f1e340]:
                    - generic [ref=f1e341]: Освоено (0)
                    - generic [ref=f1e343]: 0%
            - generic [ref=f1e344]:
                - generic [ref=f1e345]: '⚠️ Lapsed caps: 0'
                - generic [ref=f1e346]: '🔒 Context-production capped: 0'
    - navigation [ref=f1e347]:
        - button "🏠 Главная" [ref=f1e348] [cursor=pointer]:
            - generic [ref=f1e349]: 🏠
            - generic [ref=f1e350]: Главная
        - button "🎴 SRS" [ref=f1e351] [cursor=pointer]:
            - generic [ref=f1e352]: 🎴
            - generic [ref=f1e353]: SRS
        - button "🤖 Инструменты" [ref=f1e354] [cursor=pointer]:
            - generic [ref=f1e355]: 🤖
            - generic [ref=f1e356]: Инструменты
        - button "📖 Учебник" [ref=f1e357] [cursor=pointer]:
            - generic [ref=f1e358]: 📖
            - generic [ref=f1e359]: Учебник
        - button "👤 Профиль" [ref=f1e360] [cursor=pointer]:
            - generic [ref=f1e361]: 👤
            - generic [ref=f1e362]: Профиль
    - status
    - generic [ref=f1e363]: 'Экран: Статистика'
    - alert [ref=f1e364]
    - dialog:
        - generic:
            - generic:
                - generic:
                    - heading [level=2]
                - paragraph
                - paragraph
```

# Test source

```ts
  30  |       if (loader) loader.style.display = 'none';
  31  |       const home = document.getElementById('screen-home');
  32  |       if (home) home.classList.remove('hidden');
  33  |     }
  34  |   });
  35  |   await page.waitForSelector('#screen-home:not(.hidden)', { timeout: 5000 }).catch(() => {});
  36  | }
  37  |
  38  | // Helper: navigate programmatically between screens for isolated testing
  39  | async function navigateTo(page, screenId) {
  40  |   await page.evaluate((target) => {
  41  |     if (typeof window.nav === 'function') {
  42  |       window.nav(target);
  43  |     } else {
  44  |       document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  45  |       const sc = document.getElementById(`screen-${target}`);
  46  |       if (sc) sc.classList.remove('hidden');
  47  |     }
  48  |   }, screenId);
  49  |   await page.waitForSelector(`#screen-${screenId}:not(.hidden)`, { timeout: 5000 });
  50  | }
  51  |
  52  | // ===== AXE TESTS =====
  53  |
  54  | test.describe('Accessibility: axe-core WCAG A/AA checks', () => {
  55  |   test.beforeEach(async ({ page }) => {
  56  |     await page.goto('./');
  57  |     await prepareHomeScreen(page);
  58  |   });
  59  |
  60  |   test('Home screen: no critical structural axe violations', async ({ page }) => {
  61  |     const results = await new AxeBuilder({ page })
  62  |       .include('#screen-home')
  63  |       .withTags(['wcag2a', 'wcag2aa'])
  64  |       .disableRules(['color-contrast'])
  65  |       .analyze();
  66  |
  67  |     const criticalViolations = results.violations.filter(
  68  |       (v) => v.impact === 'critical' || v.impact === 'serious'
  69  |     );
  70  |     expect(criticalViolations).toHaveLength(0);
  71  |   });
  72  |
  73  |   test('Settings screen: no critical structural axe violations', async ({ page }) => {
  74  |     await navigateTo(page, 'settings');
  75  |
  76  |     const results = await new AxeBuilder({ page })
  77  |       .include('#screen-settings')
  78  |       .withTags(['wcag2a', 'wcag2aa'])
  79  |       .disableRules(['color-contrast'])
  80  |       .analyze();
  81  |
  82  |     const criticalViolations = results.violations.filter(
  83  |       (v) => v.impact === 'critical' || v.impact === 'serious'
  84  |     );
  85  |     expect(criticalViolations).toHaveLength(0);
  86  |   });
  87  |
  88  |   test('Study plan screen: no critical structural axe violations', async ({ page }) => {
  89  |     await navigateTo(page, 'plan');
  90  |
  91  |     const results = await new AxeBuilder({ page })
  92  |       .include('#screen-plan')
  93  |       .withTags(['wcag2a', 'wcag2aa'])
  94  |       .disableRules(['color-contrast'])
  95  |       .analyze();
  96  |
  97  |     const criticalViolations = results.violations.filter(
  98  |       (v) => v.impact === 'critical' || v.impact === 'serious'
  99  |     );
  100 |     expect(criticalViolations).toHaveLength(0);
  101 |   });
  102 |
  103 |   test('SRS/Flashcards screen: no critical structural axe violations', async ({ page }) => {
  104 |     await navigateTo(page, 'srs');
  105 |
  106 |     const results = await new AxeBuilder({ page })
  107 |       .include('#screen-srs')
  108 |       .withTags(['wcag2a', 'wcag2aa'])
  109 |       .disableRules(['color-contrast'])
  110 |       .analyze();
  111 |
  112 |     const criticalViolations = results.violations.filter(
  113 |       (v) => v.impact === 'critical' || v.impact === 'serious'
  114 |     );
  115 |     expect(criticalViolations).toHaveLength(0);
  116 |   });
  117 |
  118 |   test('Statistics screen: no critical structural axe violations', async ({ page }) => {
  119 |     await navigateTo(page, 'statistics');
  120 |
  121 |     const results = await new AxeBuilder({ page })
  122 |       .include('#screen-statistics')
  123 |       .withTags(['wcag2a', 'wcag2aa'])
  124 |       .disableRules(['color-contrast'])
  125 |       .analyze();
  126 |
  127 |     const criticalViolations = results.violations.filter(
  128 |       (v) => v.impact === 'critical' || v.impact === 'serious'
  129 |     );
> 130 |     expect(criticalViolations).toHaveLength(0);
      |                                ^ Error: expect(received).toHaveLength(expected)
  131 |   });
  132 |
  133 |   test('Shop modal: has role=dialog, aria-modal, aria-labelledby', async ({ page }) => {
  134 |     await page.evaluate(() => {
  135 |       const modal = document.getElementById('shop-modal');
  136 |       if (modal) {
  137 |         modal.classList.remove('hidden');
  138 |         modal.style.display = 'block';
  139 |       }
  140 |     });
  141 |     await page.waitForTimeout(100);
  142 |
  143 |     const modal = page.locator('#shop-modal');
  144 |     await expect(modal).toHaveAttribute('role', 'dialog');
  145 |     await expect(modal).toHaveAttribute('aria-modal', 'true');
  146 |     await expect(modal).toHaveAttribute('aria-labelledby', 'shop-modal-title');
  147 |
  148 |     const results = await new AxeBuilder({ page })
  149 |       .include('#shop-modal')
  150 |       .withTags(['wcag2a', 'wcag2aa'])
  151 |       .disableRules(['color-contrast'])
  152 |       .analyze();
  153 |
  154 |     const criticalViolations = results.violations.filter(
  155 |       (v) => v.impact === 'critical' || v.impact === 'serious'
  156 |     );
  157 |     expect(criticalViolations).toHaveLength(0);
  158 |   });
  159 |
  160 |   test('Document has lang="ru" on html element', async ({ page }) => {
  161 |     const lang = await page.getAttribute('html', 'lang');
  162 |     expect(lang).toBe('ru');
  163 |   });
  164 |
  165 |   test('Viewport allows user scaling', async ({ page }) => {
  166 |     const viewport = await page.$eval('meta[name="viewport"]', (el) => el.getAttribute('content'));
  167 |     expect(viewport).not.toContain('user-scalable=no');
  168 |     expect(viewport).not.toMatch(/maximum-scale=1(?:[^.]|$)/);
  169 |   });
  170 |
  171 |   test('Live region elements exist in DOM', async ({ page }) => {
  172 |     await expect(page.locator('#a11y-announce')).toBeAttached();
  173 |     const politeRole = await page.getAttribute('#a11y-announce', 'aria-live');
  174 |     expect(politeRole).toBe('polite');
  175 |
  176 |     await expect(page.locator('#a11y-alert')).toBeAttached();
  177 |     const alertRole = await page.getAttribute('#a11y-alert', 'role');
  178 |     expect(alertRole).toBe('alert');
  179 |   });
  180 | });
  181 |
  182 | // ===== KEYBOARD NAVIGATION TESTS =====
  183 |
  184 | test.describe('Keyboard Navigation', () => {
  185 |   test.beforeEach(async ({ page }) => {
  186 |     await page.goto('./');
  187 |     await prepareHomeScreen(page);
  188 |   });
  189 |
  190 |   test('Navigation to SRS screen moves focus to heading or screen', async ({ page }) => {
  191 |     await navigateTo(page, 'srs');
  192 |
  193 |     const isSrsActive = await page.evaluate(() => {
  194 |       const srs = document.getElementById('screen-srs');
  195 |       return srs && !srs.classList.contains('hidden');
  196 |     });
  197 |
  198 |     expect(isSrsActive).toBe(true);
  199 |   });
  200 |
  201 |   test('Hidden screens have inert attribute set', async ({ page }) => {
  202 |     await navigateTo(page, 'srs');
  203 |
  204 |     const homeInert = await page.evaluate(() => document.getElementById('screen-home')?.inert);
  205 |     expect(homeInert).toBe(true);
  206 |
  207 |     const srsInert = await page.evaluate(() => document.getElementById('screen-srs')?.inert);
  208 |     expect(srsInert).toBe(false);
  209 |   });
  210 |
  211 |   test('Live region announces navigation', async ({ page }) => {
  212 |     await navigateTo(page, 'settings');
  213 |
  214 |     const announcement = await page.evaluate(
  215 |       () => document.getElementById('a11y-announce')?.textContent
  216 |     );
  217 |     expect(announcement).toContain('Настройки');
  218 |   });
  219 | });
  220 |
  221 | // ===== MODAL KEYBOARD TESTS =====
  222 |
  223 | test.describe('Modal Keyboard Management', () => {
  224 |   test.beforeEach(async ({ page }) => {
  225 |     await page.goto('./');
  226 |     await prepareHomeScreen(page);
  227 |   });
  228 |
  229 |   test('Shop modal: Escape closes it', async ({ page }) => {
  230 |     await page.evaluate(() => {
```
