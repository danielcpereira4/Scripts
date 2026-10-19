/*
 * Script Name: Defesa Disponivel
 * Version: v2.1
 * Author: imRevo (https://discord.gg/tQcnVaAbfy)
 * Based on: Villages Troops Counter by NunoF- e Support Counter by Aviendha
 *
 * v2.1
 *  - Novo: tropas em apoio fora (nas tuas aldeias, noutros jogadores, em bárbaras), por grupo
 *  - Novo: população de cada linha, lida da configuração do próprio mundo
 *  - Novo: apoio fora e top 5 jogadores apoiados no ticket do Discord
 *  - Corrigido: o script já não mexe na lista de unidades do jogo (game_data.units)
 *  - Corrigido: pausas entre pedidos em mundos sem buscas
 *  - Corrigido: um pedido falhado já não é guardado nem enviado como se fosse zero
 */

if (typeof defesaDisponivel !== 'undefined') {
    defesaDisponivel.init();
} else {

class DefesaDisponivel {

    static VERSION = 'v2.1';

    // Marca: para trocar o logótipo basta mudar este endereço
    static BRAND_NAME    = 'imRevo';
    static DISCORD_URL   = 'https://discord.gg/tQcnVaAbfy';
    static LOGO_URL      = 'https://i.imgur.com/sJM14FI.png';

    // Só usado se não for possível ler a população do mundo (get_unit_info)
    static DEFAULT_POP = {
        spear: 1, sword: 1, axe: 1, archer: 1, spy: 2, light: 4, marcher: 5,
        heavy: 6, ram: 5, catapult: 8, knight: 10, snob: 100
    };

    static UNIT_LABELS = {
        spear: 'Lanceiros', sword: 'Espadachins', axe: 'Vikings', archer: 'Arqueiros',
        spy: 'Batedores', light: 'Cavalaria Leve', marcher: 'Arqueiros a Cavalo',
        heavy: 'Cavalaria Pesada', ram: 'Aríetes', catapult: 'Catapultas',
        knight: 'Paladinos', snob: 'Nobres'
    };

    constructor() {
        // Cópia: não alterar game_data.units, que o próprio jogo usa
        this.availableSupportUnits = game_data.units.filter(function (u) { return u !== 'militia'; });
        this.worldConfig         = null;
        this.isScavengingWorld   = false;
        this.worldConfigFileName = 'worldConfigFile' + game_data.world;
        this.unitInfoFileName    = 'unitInfoFile' + game_data.world;
        this.unitPop             = {};
    }

    async init() {
        if (!game_data.features.Premium.active) {
            UI.ErrorMessage('É necessário ter conta Premium para usar este script!');
            return;
        }
        try {
            await this.#initWorldConfig();
            await this.#initUnitPop();
            await this.#createUI();
        } catch (e) {
            console.error('[Defesa Disponivel]', e);
            UI.ErrorMessage('Defesa Disponível: ' + (e && e.message ? e.message : e));
        }
    }

    // ---------- Configuração do mundo ----------

    async #initWorldConfig() {
        var worldConfig = this.#storageGet(this.worldConfigFileName);
        if (worldConfig === null) {
            UI.InfoMessage('A carregar configurações do mundo...');
            worldConfig = await this.#fetchXmlString('/interface.php?func=get_config', this.worldConfigFileName);
            if (worldConfig === null) throw new Error('não foi possível ler as configurações do mundo. Tenta de novo.');
        }
        this.worldConfig = $.parseXML(worldConfig);
        var scavenging = this.worldConfig.getElementsByTagName('scavenging')[0];
        this.isScavengingWorld = !!scavenging && scavenging.textContent.trim() === '1';
    }

    async #initUnitPop() {
        var str = this.#storageGet(this.unitInfoFileName);
        if (str === null) {
            str = await this.#fetchXmlString('/interface.php?func=get_unit_info', this.unitInfoFileName);
        }
        var xml = null;
        if (str !== null) {
            try { xml = $.parseXML(str); } catch (e) { xml = null; }
        }
        var self = this;
        game_data.units.forEach(function (unit) {
            var pop = NaN;
            if (xml) {
                var el = xml.getElementsByTagName(unit)[0];
                var popEl = el ? el.getElementsByTagName('pop')[0] : null;
                if (popEl) pop = parseInt(popEl.textContent, 10);
            }
            self.unitPop[unit] = isNaN(pop) ? (DefesaDisponivel.DEFAULT_POP[unit] || 1) : pop;
        });
    }

    // Só guarda em cache se a resposta for XML válido
    async #fetchXmlString(url, storageKey) {
        var data = this.#fetchHtmlPage(url);
        await this.#waitMilliseconds(Date.now(), 200);
        if (!data) return null;
        var str = (typeof data === 'string') ? data : (new XMLSerializer()).serializeToString(data);
        try { $.parseXML(str); } catch (e) { return null; }
        if (str.indexOf('<config') === -1) return null;
        try { localStorage.setItem(storageKey, str); } catch (e) { /* sem espaço: segue sem cache */ }
        return str;
    }

    #storageGet(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    // ---------- Utilitários ----------

    async #waitMilliseconds(lastRunTime, milliseconds = 0) {
        await new Promise(res => setTimeout(res, Math.max(lastRunTime + milliseconds - Date.now(), 0)));
    }

    #generateUrl(screen, mode, extraParams) {
        mode        = mode        || null;
        extraParams = extraParams || {};
        var url = '/game.php?village=' + game_data.village.id + '&screen=' + screen;
        if (mode !== null) url += '&mode=' + mode;
        $.each(extraParams, function (key, value) { url += '&' + key + '=' + value; });
        if (game_data.player.sitter !== '0') url += '&t=' + game_data.player.id;
        return url;
    }

    #initTroops() {
        var troops = {};
        this.availableSupportUnits.forEach(function (unit) { troops[unit] = 0; });
        return troops;
    }

    #fetchHtmlPage(url) {
        var temp_data = null;
        $.ajax({
            async: false, url: url, type: 'GET',
            success: function (data) { temp_data = data; },
            error:   function () { UI.ErrorMessage('Erro ao carregar: ' + url); }
        });
        return temp_data;
    }

    #calcPop(troops) {
        var self = this;
        var pop  = 0;
        this.availableSupportUnits.forEach(function (unit) {
            pop += (troops[unit] || 0) * (self.unitPop[unit] || 0);
        });
        return pop;
    }

    #sumTroops(a, b) {
        var total = this.#initTroops();
        this.availableSupportUnits.forEach(function (unit) {
            total[unit] = (a[unit] || 0) + (b[unit] || 0);
        });
        return total;
    }

    #esc(value) {
        return String(value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    #unitLabel(unit) {
        return DefesaDisponivel.UNIT_LABELS[unit] || unit;
    }

    // "100 Lanceiros · 20 Espadachins" (só unidades com tropas)
    #unitsText(troops, separator) {
        var self  = this;
        var parts = [];
        this.availableSupportUnits.forEach(function (unit) {
            if (troops[unit]) parts.push(troops[unit] + ' ' + self.#unitLabel(unit));
        });
        return parts.length ? parts.join(separator || ' · ') : 'sem tropas';
    }

    // ---------- Tropas em casa e em buscas ----------

    async #getTroopsScavengingWorldObj() {
        var troopsObj = {
            villagesTroops:    this.#initTroops(),
            scavengingTroops:  this.#initTroops()
        };

        var currentPage = 0;
        var lastRunTime = null;
        var self = this;

        do {
            var scavengingObject = await getScavengeMassScreenJson(self, currentPage, lastRunTime);
            if (!scavengingObject) return null;
            if (scavengingObject.length === 0) break;
            lastRunTime = Date.now();

            $.each(scavengingObject, function (id, villageData) {
                $.each(villageData.unit_counts_home, function (key, value) {
                    if (key in troopsObj.villagesTroops) troopsObj.villagesTroops[key] += value;
                });
                $.each(villageData.options, function (id, option) {
                    if (option.scavenging_squad !== null) {
                        $.each(option.scavenging_squad.unit_counts, function (key, value) {
                            if (key in troopsObj.scavengingTroops) troopsObj.scavengingTroops[key] += value;
                        });
                    }
                });
            });
            currentPage++;
        } while (true);

        return troopsObj;

        async function getScavengeMassScreenJson(obj, page, lastRunTime) {
            await obj.#waitMilliseconds(lastRunTime || 0, 200);
            var html = obj.#fetchHtmlPage(obj.#generateUrl('place', 'scavenge_mass', { page: page }));
            var matches = (typeof html === 'string') ? html.match(/ScavengeMassScreen[\s\S]*?(,\n *\[.*?\}{0,3}\],\n)/) : null;
            if (!matches || matches.length <= 1) {
                UI.ErrorMessage('Erro ao localizar dados de buscas.');
                return false;
            }
            var str = matches[1];
            str = str.substring(str.indexOf('['));
            str = str.substring(0, str.length - 2);
            return JSON.parse(str);
        }
    }

    async #getTroopsNonScavengingWorldObj() {
        var troopsObj = {
            villagesTroops:   this.#initTroops(),
            scavengingTroops: this.#initTroops()
        };

        var currentPage = 0;
        var self        = this;
        await this.#setMaxLinesPerPage(this, 'overview_villages', 'units', 1000);
        await this.#waitMilliseconds(Date.now(), 200);
        var lastVillageId = null;

        do {
            var lastRunTime = Date.now();
            var pageHtml = this.#fetchHtmlPage(this.#generateUrl('overview_villages', 'units', { page: currentPage }));
            if (typeof pageHtml !== 'string') return null;
            var overviewTroopsPage = $.parseHTML(pageHtml);
            var troopsTable        = $(overviewTroopsPage).find('#units_table tbody');

            var lastVillageIdTemp = $(troopsTable).find('span').eq(0).attr('data-id');
            if (lastVillageId !== null && lastVillageId === lastVillageIdTemp) break;
            if (lastVillageIdTemp === undefined) break;
            lastVillageId = lastVillageIdTemp;

            $.each(troopsTable, function (id, tbodyObj) {
                var villageTroopsLine = $(tbodyObj).find('tr').eq(0).find('td:gt(1)');
                var c = 0;
                $.each(self.availableSupportUnits, function (key, value) {
                    troopsObj.villagesTroops[value] += parseInt(villageTroopsLine.eq(c).text().trim()) || 0;
                    c++;
                });
            });

            currentPage++;
            await this.#waitMilliseconds(lastRunTime, 200);
        } while (true);

        return troopsObj;
    }

    async #setMaxLinesPerPage(obj, screen, mode, value) {
        await new Promise(res => setTimeout(res, 200));
        var form = document.createElement('form');
        form.method = 'POST';
        form.action = '#';
        $.each({ page_size: value, h: game_data.csrf }, function (key, val) {
            var input   = document.createElement('input');
            input.name  = key;
            input.value = val;
            form.appendChild(input);
        });
        $.ajax({
            type:  'POST',
            url:   obj.#generateUrl(screen, mode, { action: 'change_page_size', type: 'all' }),
            data:  $(form).serialize(),
            async: false
        });
    }

    // ---------- Tropas em apoio fora ----------
    // Lê Visualizações > Tropas > Apoio (away_detail), já filtrado pelo grupo atual.
    // Devolve null se o pedido falhar (diferente de "sem apoio", que devolve totais a zero).

    async #getSupportAwayObj() {
        await this.#waitMilliseconds(Date.now(), 200);
        var html = this.#fetchHtmlPage(this.#generateUrl('overview_villages', 'units', {
            type: 'away_detail', filter_villages: 1, page: -1, group: game_data.group_id
        }));
        if (typeof html !== 'string') return null;

        var $page  = $('<div>').append($.parseHTML(html));
        var $table = $page.find('#units_table');
        var self   = this;

        var support = {
            total:   { totalUnits: this.#initTroops(), pop: 0 },
            own:     { totalUnits: this.#initTroops(), pop: 0, villages: Object.create(null) },
            barbs:   { totalUnits: this.#initTroops(), pop: 0, villages: Object.create(null) },
            players: { totalUnits: this.#initTroops(), pop: 0, tribes:   Object.create(null) }
        };

        if ($table.length === 0) {
            // Página do jogo carregada mas sem tabela = não há apoio fora.
            // Outra coisa (sessão expirada, proteção anti-bot) = falha.
            return $page.find('#paged_view_content, #content_value').length ? support : null;
        }

        // Que unidade está em cada coluna, lida da linha de cabeçalho que tem as imagens das unidades.
        // (A 1.ª linha da tabela é a de "selecionar todos"; antes das unidades há "Aldeia" e "distância".)
        var unitOfCell = function (cell) {
            var unit = $(cell).find('[data-unit]').attr('data-unit');
            if (unit) return unit;
            var m = ($(cell).find('img').attr('src') || '').match(/unit_([a-z]+)/);
            return m ? m[1] : null;
        };
        var columnUnits = null;
        $table.find('tr').each(function (i, tr) {
            // toArray().map (e não $.map) para manter as colunas sem unidade como null
            var cols = $(tr).children('th, td').toArray().map(unitOfCell);
            if (cols.filter(Boolean).length >= 2) { columnUnits = cols; return false; }
        });
        // Sem cabeçalho reconhecível não adivinhamos colunas: conta como falha
        if (!columnUnits) return null;

        var addTo = function (target, unit, count) {
            if (!(unit in target.totalUnits)) return;
            target.totalUnits[unit] += count;
            target.pop += count * (self.unitPop[unit] || 0);
        };

        $table.find('tr').each(function (i, row) {
            if ($(row).hasClass('units_away')) return;
            var $cells = $(row).children('td');
            if ($cells.length < 2) return;

            var $first   = $cells.eq(0);
            var $village = $first.find('span.village_anchor > a').first();
            var villageName = $village.text().trim();
            if (!villageName) return;

            var playerName = $first.find('a[href*="info_player"]').first().text().trim();
            var tribeName  = $first.find('a[href*="info_ally"]').first().text().trim();
            var cellText   = $first.text();

            var group;
            var tribe = null;
            if (!playerName) {
                group = /---|b[áa]rbar/i.test(cellText) ? support.barbs : support.own;
            } else {
                var tribeKey = tribeName || 'Sem tribo';
                if (!support.players.tribes[tribeKey]) {
                    support.players.tribes[tribeKey] = { totalUnits: self.#initTroops(), pop: 0, players: Object.create(null) };
                }
                tribe = support.players.tribes[tribeKey];
                if (!tribe.players[playerName]) {
                    tribe.players[playerName] = { totalUnits: self.#initTroops(), pop: 0, villages: Object.create(null) };
                }
                group = tribe.players[playerName];
            }

            if (!group.villages[villageName]) {
                group.villages[villageName] = { totalUnits: self.#initTroops(), pop: 0, url: $village.attr('href') || '#' };
            }
            var village = group.villages[villageName];

            $cells.each(function (c, cell) {
                var unit = columnUnits[c];
                if (!unit) return;
                var count = parseInt($(cell).text().replace(/\D/g, ''), 10) || 0;
                if (!count) return;
                addTo(village, unit, count);
                addTo(group, unit, count);
                addTo(support.total, unit, count);
                if (tribe) {
                    addTo(tribe, unit, count);
                    addTo(support.players, unit, count);
                }
            });
        });

        return support;
    }

    // ---------- Grupos ----------

    #getGroupsObj() {
        var page   = this.#fetchHtmlPage(this.#generateUrl('overview_villages', 'groups', { type: 'static' }));
        var html   = $.parseHTML(typeof page === 'string' ? page : '');
        var groups = $(html).find('.vis_item').find('a,strong');
        var groupsArr = {};
        if ($(groups).length > 0) {
            $.each(groups, function (id, group) {
                var val = $(group).text().trim();
                groupsArr[group.getAttribute('data-group-id')] = val.substring(1, val.length - 1);
            });
        } else {
            groups = $(html).find('.vis_item select option');
            $.each(groups, function (id, group) {
                groupsArr[(new URLSearchParams($(group).val())).get('group')] = $(group).text().trim();
            });
        }
        return groupsArr;
    }

    // ---------- Janela ----------

    async #createUI() {
        UI.InfoMessage('A carregar...');
        this._troopsObj = this.isScavengingWorld
            ? await this.#getTroopsScavengingWorldObj()
            : await this.#getTroopsNonScavengingWorldObj();

        if (!this._troopsObj) {
            UI.ErrorMessage('Não foi possível ler as tropas. Nada foi alterado; tenta de novo daqui a pouco.');
            return;
        }

        this._totalTroops = this.#sumTroops(this._troopsObj.villagesTroops, this._troopsObj.scavengingTroops);

        // undefined = caixa desligada (não lido); null = falhou; objeto = lido
        this._supportObj = this.#includeSupport() ? await this.#getSupportAwayObj() : undefined;

        await this.#waitMilliseconds(Date.now(), 200);
        this._groups = this.#getGroupsObj();

        this.#render();
    }

    #render() {
        var html = this.#buildHtml(this._troopsObj, this._totalTroops, this._supportObj, this._groups);
        Dialog.show('defesa_disponivel', html, Dialog.close());
        $('#popup_box_defesa_disponivel').css('width', 'unset');

        var self = this;
        $('#sendToDiscord').on('click', function () {
            self.#sendToDiscord(self._totalTroops, self._troopsObj, self.#includeSupport() ? self._supportObj : undefined);
        });

        if (this._supportObj === null) {
            UI.ErrorMessage('Tropas carregadas, mas não foi possível ler o apoio fora.', 4000);
        } else {
            UI.SuccessMessage('Carregado com sucesso!', 500);
        }
    }

    // Preferência guardada no browser; por defeito ligada
    #includeSupport() {
        return this.#storageGet('ddIncludeSupport') !== '0';
    }

    async toggleSupport(checkbox) {
        try { localStorage.setItem('ddIncludeSupport', checkbox.checked ? '1' : '0'); } catch (e) { /* segue sem guardar */ }
        try {
            // Só lê a página de apoio quando é preciso (ligada e ainda não lida, ou falhou antes)
            if (checkbox.checked && !this._supportObj) {
                UI.InfoMessage('A carregar apoio fora...');
                this._supportObj = await this.#getSupportAwayObj();
            }
            this.#render();
        } catch (e) {
            console.error('[Defesa Disponivel]', e);
            UI.ErrorMessage('Defesa Disponível: ' + (e && e.message ? e.message : e));
        }
    }

    #buildHtml(troopsObj, totalTroops, supportObj, groups) {
        var self = this;

        // Lista de grupos
        var groupsHtml = '<label for="dd_group_select" style="font-weight:bold;margin-right:6px;">Grupo:</label>'
                       + '<select id="dd_group_select" onchange="defesaDisponivel.changeGroup(this)">';
        $.each(groups, function (groupId, group) {
            var selected = String(game_data.group_id) === String(groupId) ? 'selected' : '';
            groupsHtml += '<option value="' + self.#esc(groupId) + '" ' + selected + '>' + self.#esc(group) + '</option>';
        });
        groupsHtml += '</select>';

        // Cabeçalho
        var headerHtml = '<tr><th class="center" style="width:0px;"></th>';
        this.availableSupportUnits.forEach(function (unit) {
            headerHtml += '<th style="text-align:center" width="35"><a href="#" class="unit_link" data-unit="' + unit + '">'
                        + '<img src="https://dspt.innogamescdn.com/asset/2a2f957f/graphic/unit/unit_' + unit + '.png" alt="' + self.#esc(self.#unitLabel(unit)) + '" title="' + self.#esc(self.#unitLabel(unit)) + '"></a></th>';
        });
        headerHtml += '<th style="text-align:center">População</th></tr>';

        // Linhas
        var rows = '';
        if (this.isScavengingWorld) {
            rows += this.#buildRow('Em casa',  troopsObj.villagesTroops);
            rows += this.#buildRow('Em busca', troopsObj.scavengingTroops);
        }
        rows += this.#buildRow('Total disponível', totalTroops, true);
        var showSupport = this.#includeSupport();
        if (showSupport && supportObj) {
            rows += this.#buildRow('Em apoio fora', supportObj.total.totalUnits);
            rows += this.#buildRow('Total geral', this.#sumTroops(totalTroops, supportObj.total.totalUnits), true);
        } else if (showSupport) {
            rows += this.#buildEmptyRow('Em apoio fora', 'não foi possível ler — desliga e volta a ligar a caixa para tentar de novo');
        } else {
            supportObj = undefined;
        }

        var supportToggle = '<label for="dd_include_support" style="margin-left:16px;cursor:pointer;">'
            + '<input type="checkbox" id="dd_include_support" ' + (showSupport ? 'checked' : '')
            + ' onchange="defesaDisponivel.toggleSupport(this)"> Incluir tropas em apoio fora (janela e ticket)</label>';

        return `
<div>
  <br>
  <h3>${this.isScavengingWorld ? 'Contador de tropas em casa, em buscas e em apoio' : 'Contador de tropas em casa e em apoio'}</h3>
  ${groupsHtml}
  ${supportToggle}
  <br><br>
  <table id="support_sum" class="vis overview_table" width="100%">
    <thead>${headerHtml}</thead>
    <tbody>${rows}</tbody>
  </table>
  ${this.#buildSupportDetails(supportObj)}
  <br>
  <button type="button" id="sendToDiscord" style="
    display:block; margin:0 auto; padding:8px 16px;
    background:linear-gradient(to bottom,#f2e5b6,#d6c58a);
    border:1px solid #b59e4c; border-radius:6px;
    color:#383020; font-weight:bold; font-size:14px;
    cursor:pointer; transition:transform .2s,box-shadow .2s;">
    <img src="${DefesaDisponivel.LOGO_URL}" alt="" style="max-width:28px;max-height:28px;vertical-align:middle;margin-right:8px;">
    Partilhar defesa disponível no ticket
  </button>
  <br>
  <div id="dd_brand">
    <img src="${DefesaDisponivel.LOGO_URL}" alt="Logótipo ${DefesaDisponivel.BRAND_NAME}">
    <span>Defesa Disponível ${DefesaDisponivel.VERSION} por <strong>${DefesaDisponivel.BRAND_NAME}</strong> — dúvidas, sugestões ou mais scripts?</span>
    <a href="${DefesaDisponivel.DISCORD_URL}" target="_blank" rel="noopener" aria-label="Entrar no Discord ${DefesaDisponivel.BRAND_NAME} (abre num novo separador)">💬 Junta-te ao Discord ${DefesaDisponivel.BRAND_NAME}</a>
  </div>
</div>
<style>
  .popup_box_content { min-width:600px; }
  .mds .popup_box_content { min-width:unset !important; }
  #sendToDiscord:hover { background:linear-gradient(to bottom,#e7d49f,#c9b16f); transform:translateY(-2px); box-shadow:0 4px 8px rgba(0,0,0,.2); }
  #sendToDiscord:active { transform:translateY(0); box-shadow:0 2px 4px rgba(0,0,0,.2); }
  #sendToDiscord:focus-visible, #dd_support_details summary:focus-visible, #dd_group_select:focus-visible, #dd_include_support:focus-visible { outline:3px solid #603000; outline-offset:2px; }
  #dd_support_details { margin-top:10px; max-height:320px; overflow:auto; background:#fff5da; border:1px solid #c1a264; padding:4px 8px; }
  #dd_support_details summary { cursor:pointer; font-weight:bold; padding:3px 0; }
  #dd_support_details details details { margin-left:16px; }
  #dd_support_details .dd_units { margin-left:16px; font-size:11px; font-style:italic; }
  #dd_support_details .dd_village { margin-left:16px; }
  #dd_brand { display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; font-size:11px; padding-top:6px; border-top:1px solid #c1a264; }
  #dd_brand img { max-width:24px; max-height:24px; }
  #dd_brand a { padding:3px 8px; border-radius:4px; background:#5865f2; color:#fff; font-weight:bold; text-decoration:none; }
  #dd_brand a:hover { background:#4752c4; }
  #dd_brand a:focus-visible { outline:3px solid #603000; outline-offset:2px; }
</style>`;
    }

    #buildRow(label, troops, bold) {
        var style = bold ? 'font-weight:bold;' : '';
        var html = '<tr><td class="center" style="text-wrap:nowrap;' + style + '">' + label + '</td>';
        this.availableSupportUnits.forEach(function (unit) {
            html += '<td class="center" data-unit="' + unit + '" style="' + style + '">' + (troops[unit] || 0) + '</td>';
        });
        html += '<td class="center" style="' + style + '">' + this.#calcPop(troops) + '</td></tr>';
        return html;
    }

    #buildEmptyRow(label, message) {
        return '<tr><td class="center" style="text-wrap:nowrap;">' + label + '</td>'
             + '<td class="center" colspan="' + (this.availableSupportUnits.length + 1) + '" style="color:#a00;font-style:italic;">' + message + '</td></tr>';
    }

    #buildSupportDetails(supportObj) {
        if (!supportObj) return '';
        var self = this;

        var sortByPop = function (map) {
            return Object.keys(map).sort(function (a, b) { return map[b].pop - map[a].pop; });
        };

        var villagesHtml = function (villages) {
            var out = '';
            sortByPop(villages).forEach(function (name) {
                var v = villages[name];
                out += '<div class="dd_village"><a href="' + self.#esc(v.url) + '" target="_blank">' + self.#esc(name) + '</a> '
                     + '(' + v.pop + ' pop)<div class="dd_units">' + self.#esc(self.#unitsText(v.totalUnits)) + '</div></div>';
            });
            return out || '<div class="dd_village">Sem apoio.</div>';
        };

        var section = function (title, obj, inner) {
            return '<details><summary>' + title + ' — ' + obj.pop + ' pop</summary>'
                 + '<div class="dd_units">' + self.#esc(self.#unitsText(obj.totalUnits)) + '</div>' + inner + '</details>';
        };

        var tribesHtml = '';
        sortByPop(supportObj.players.tribes).forEach(function (tribeName) {
            var tribe = supportObj.players.tribes[tribeName];
            var playersHtml = '';
            sortByPop(tribe.players).forEach(function (playerName) {
                playersHtml += section(self.#esc(playerName), tribe.players[playerName], villagesHtml(tribe.players[playerName].villages));
            });
            var tribeTitle = tribeName === 'Sem tribo' ? 'Sem tribo' : 'Tribo ' + self.#esc(tribeName);
            tribesHtml += section(tribeTitle, tribe, playersHtml);
        });

        return '<div id="dd_support_details"><strong>Detalhe do apoio fora</strong>'
             + section('Nas tuas aldeias', supportObj.own, villagesHtml(supportObj.own.villages))
             + section('Noutros jogadores', supportObj.players, tribesHtml || '<div class="dd_village">Sem apoio.</div>')
             + section('Em aldeias bárbaras', supportObj.barbs, villagesHtml(supportObj.barbs.villages))
             + '</div>';
    }

    // ---------- Discord ----------

    #sendToDiscord(totalTroops, troopsObj, supportObj) {
        if (typeof webhookURL !== 'string' || !webhookURL.startsWith('https://discord.com/api/webhooks/')) {
            alert('❌ Webhook inválido. Por favor insere o teu webhook no marcador.');
            return;
        }

        var self         = this;
        var playerName   = game_data.player.name;
        var currentGroup = $('#popup_box_defesa_disponivel select option:selected').text().trim() || 'todos';
        var serverTime   = $('#serverDate').text() + ' ' + $('#serverTime').text();
        var hasArcher    = game_data.units.includes('archer');
        var hasKnight    = game_data.units.includes('knight');

        var fields = [
            { name: '🗂️ **Grupo Atual**',                                                  value: currentGroup,                   inline: false },
            { name: '<:Lanceiro:1490679628149424158> **Lanceiros**',                        value: '' + totalTroops.spear,         inline: true  },
            { name: '<:Espadachim:1490679660915327067> **Espadachins**',                    value: '' + totalTroops.sword,         inline: true  },
        ];

        if (hasArcher) {
            fields.push({ name: '<:Arqueiro:1490679499623370752> **Arqueiros**',            value: '' + (totalTroops.archer || 0), inline: true });
        }

        fields.push(
            { name: '<:Batedor:1490679522943701002> **Batedores**',                         value: '' + totalTroops.spy,           inline: true  },
            { name: '<:CavalariaLeve:1498619514315870318> **Cavalaria Leve**',              value: '' + totalTroops.light,         inline: true  },
            { name: '<:CavalariaPesada:1490679597837320362> **Cavalaria Pesada**',          value: '' + totalTroops.heavy,         inline: true  },
            { name: '<:Catapulta:1490679560830976061> **Catapultas**',                      value: '' + totalTroops.catapult,      inline: true  }
        );

        if (hasKnight) {
            fields.push({ name: '<:Paladino:1490679690871177247> **Paladinos**',            value: '' + (totalTroops.knight || 0), inline: true });
        }

        fields.push({ name: '👥 **População disponível**', value: '' + this.#calcPop(totalTroops), inline: false });

        // Apoio fora
        if (supportObj) {
            var defUnits = ['spear', 'sword', 'archer', 'spy', 'light', 'heavy', 'catapult', 'knight'];
            var awayParts = [];
            defUnits.forEach(function (u) {
                var n = supportObj.total.totalUnits[u] || 0;
                if (n) awayParts.push(n + ' ' + self.#unitLabel(u));
            });
            fields.push({
                name:   '🤝 **Em apoio fora** (' + supportObj.total.pop + ' pop)',
                value:  this.#limit(awayParts.length ? awayParts.join(' | ') : 'Sem tropas em apoio.', 1024),
                inline: false
            });

            // Top 5 jogadores apoiados
            var list = [];
            Object.keys(supportObj.players.tribes).forEach(function (tribeName) {
                var tribe = supportObj.players.tribes[tribeName];
                Object.keys(tribe.players).forEach(function (name) {
                    list.push({ name: name, tribe: tribeName, pop: tribe.players[name].pop });
                });
            });
            list.sort(function (a, b) { return b.pop - a.pop; });
            var lines = list.slice(0, 5).map(function (p, i) {
                return (i + 1) + '. ' + p.name + ' [' + p.tribe + '] — ' + p.pop + ' pop';
            });
            if (list.length > 5) lines.push('… e mais ' + (list.length - 5) + ' jogador(es)');
            lines.push('Nas tuas aldeias: ' + supportObj.own.pop + ' pop · Bárbaras: ' + supportObj.barbs.pop + ' pop');
            fields.push({ name: '📍 **Mais apoiados**', value: this.#limit(lines.join('\n'), 1024), inline: false });

            // Aldeias com apoio, tapadas por spoiler (||...||) para não encher o ticket
            fields = fields.concat(this.#villageSpoilerFields(supportObj, fields));
        } else if (supportObj === null) {
            fields.push({ name: '🤝 **Em apoio fora**', value: 'Não foi possível ler o apoio fora.', inline: false });
        }
        // supportObj === undefined: caixa desligada, não envia nada sobre apoio

        // Divisão em casa vs em busca
        var extraContent = '';
        if (this.isScavengingWorld) {
            var splitUnits = [
                { key: 'spear',   label: 'Lanceiros'        },
                { key: 'sword',   label: 'Espadachins'      },
                { key: 'archer',  label: 'Arqueiros',  show: hasArcher },
                { key: 'light',   label: 'Cavalaria Leve'   },
                { key: 'heavy',   label: 'Cavalaria Pesada' }
            ];

            var emCasa = [];
            var emBusca = [];
            splitUnits.forEach(function (u) {
                if (u.show === false) return;
                emCasa.push((troopsObj.villagesTroops[u.key]   || 0) + ' ' + u.label);
                emBusca.push((troopsObj.scavengingTroops[u.key] || 0) + ' ' + u.label);
            });

            extraContent = '\n**Em casa:** ' + emCasa.join(' | ') +
                           '\n**Em busca:** ' + emBusca.join(' | ');
        }

        var payload = {
            content: '**Tropa Defensiva (Atualizado em: ' + serverTime + ')**\n**Jogador:** ' + playerName + extraContent,
            embeds: [{
                title:  '**🛡️ TROPA DEFENSIVA — TOTAL**',
                fields: fields
            }]
        };

        $.ajax({
            url:         webhookURL,
            method:      'POST',
            contentType: 'application/json',
            data:        JSON.stringify(payload),
            success: function () { alert('✅ Defesa partilhada com sucesso!'); },
            error:   function () { alert('❌ Erro ao enviar para o Discord.'); }
        });
    }

    // Lista "onde está cada apoio" em campos com spoiler, dentro dos limites do Discord
    // (1024 caracteres por campo, 6000 por mensagem, 25 campos)
    #villageSpoilerFields(supportObj, existingFields) {
        var self = this;
        var sortByPop = function (map) {
            return Object.keys(map).sort(function (a, b) { return map[b].pop - map[a].pop; });
        };
        var villageLine = function (prefix, name, v) {
            return prefix + name + ': ' + self.#unitsText(v.totalUnits) + ' (' + v.pop + ' pop)';
        };

        var lines = [];
        sortByPop(supportObj.own.villages).forEach(function (name) {
            lines.push(villageLine('🏠 ', name, supportObj.own.villages[name]));
        });
        var players = [];
        Object.keys(supportObj.players.tribes).forEach(function (tribeName) {
            var tribe = supportObj.players.tribes[tribeName];
            Object.keys(tribe.players).forEach(function (name) {
                players.push({ name: name, tribe: tribeName, data: tribe.players[name] });
            });
        });
        players.sort(function (a, b) { return b.data.pop - a.data.pop; });
        players.forEach(function (p) {
            sortByPop(p.data.villages).forEach(function (name) {
                lines.push(villageLine('👤 ' + p.name + ' [' + p.tribe + '] — ', name, p.data.villages[name]));
            });
        });
        sortByPop(supportObj.barbs.villages).forEach(function (name) {
            lines.push(villageLine('🪵 ', name, supportObj.barbs.villages[name]));
        });
        if (lines.length === 0) return [];

        // Espaço que sobra na mensagem (margem de segurança para o texto de cima)
        var used = 600;
        existingFields.forEach(function (f) { used += f.name.length + f.value.length; });
        var budget = Math.max(0, 5800 - used);
        var maxFields = Math.min(3, 25 - existingFields.length);

        var out = [];
        var chunk = [];
        var chunkLen = 0;
        var shown = 0;
        var flush = function () {
            if (!chunk.length) return;
            var value = '||' + chunk.join('\n') + '||';
            out.push({ name: out.length ? '​' : '🗺️ **Aldeias com apoio** (carrega para ver)', value: value, inline: false });
            budget -= value.length + 40;
            chunk = [];
            chunkLen = 0;
        };
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].length > 300 ? lines[i].substring(0, 299) + '…' : lines[i];
            if (chunkLen + line.length + 1 > 1000) {
                flush();
                if (out.length >= maxFields) break;
            }
            if (line.length + 50 > budget - chunkLen) break;
            chunk.push(line);
            chunkLen += line.length + 1;
            shown++;
        }
        if (out.length < maxFields) flush();
        if (shown < lines.length && out.length) {
            var last = out[out.length - 1];
            last.value = this.#limit(last.value + '\n… e mais ' + (lines.length - shown) + ' aldeia(s) — vê no jogo', 1024);
        }
        return out;
    }

    #limit(text, max) {
        return text.length <= max ? text : text.substring(0, max - 1) + '…';
    }

    async changeGroup(obj) {
        this.#fetchHtmlPage(this.#generateUrl('overview_villages', null, { group: obj.value }));
        game_data.group_id = obj.value;
        await this.#waitMilliseconds(Date.now(), 200);
        try {
            await this.#createUI();
        } catch (e) {
            console.error('[Defesa Disponivel]', e);
            UI.ErrorMessage('Defesa Disponível: ' + (e && e.message ? e.message : e));
        }
    }
}

var defesaDisponivel = new DefesaDisponivel();
defesaDisponivel.init();
}
