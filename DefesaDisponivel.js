/*
 * Script Name: Defesa Disponivel - discord: imRevo
 * Version: v1.0
 * Author: Doritooz 
 * Based on: Villages Troops Counter by NunoF-
 */

if (typeof defesaDisponivel !== 'undefined') {
    defesaDisponivel.init();
} else {

class DefesaDisponivel {

    constructor() {
        this.availableSupportUnits = Object.create(game_data.units);
        this.availableSupportUnits = Object.getPrototypeOf(this.availableSupportUnits);
        this.availableSupportUnits.splice(this.availableSupportUnits.indexOf('militia'), 1);
        this.worldConfig     = null;
        this.isScavengingWorld = false;
        this.worldConfigFileName = 'worldConfigFile' + game_data.world;
    }

    async init() {
        if (!game_data.features.Premium.active) {
            UI.ErrorMessage('É necessário ter conta Premium para usar este script!');
            return;
        }
        await this.#initWorldConfig();
        this.#createUI();
    }

    async #initWorldConfig() {
        var worldConfig = localStorage.getItem(this.worldConfigFileName);
        if (worldConfig === null) {
            UI.InfoMessage('A carregar configurações do mundo...');
            worldConfig = await this.#getWorldConfig();
        }
        this.worldConfig = $.parseXML(worldConfig);
        this.isScavengingWorld = this.worldConfig
            .getElementsByTagName('config')[0]
            .getElementsByTagName('game')[0]
            .getElementsByTagName('scavenging')[0]
            .textContent.trim() === '1';
    }

    async #getWorldConfig() {
        var xml = this.#fetchHtmlPage('/interface.php?func=get_config');
        localStorage.setItem(this.worldConfigFileName, (new XMLSerializer()).serializeToString(xml));
        await this.#waitMilliseconds(Date.now(), 200);
        return xml;
    }

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
            if (!scavengingObject) return;
            if (scavengingObject.length === 0) break;
            lastRunTime = Date.now();

            $.each(scavengingObject, function (id, villageData) {
                $.each(villageData.unit_counts_home, function (key, value) {
                    if (key !== 'militia') troopsObj.villagesTroops[key] += value;
                });
                $.each(villageData.options, function (id, option) {
                    if (option.scavenging_squad !== null) {
                        $.each(option.scavenging_squad.unit_counts, function (key, value) {
                            if (key !== 'militia') troopsObj.scavengingTroops[key] += value;
                        });
                    }
                });
            });
            currentPage++;
        } while (true);

        return troopsObj;

        async function getScavengeMassScreenJson(obj, page, lastRunTime) {
            await obj.#waitMilliseconds(lastRunTime || 0, 200);
            var html    = obj.#fetchHtmlPage(obj.#generateUrl('place', 'scavenge_mass', { page: page }));
            var matches = html.match(/ScavengeMassScreen[\s\S]*?(,\n *\[.*?\}{0,3}\],\n)/);
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
        var lastRunTime = Date.now();
        var self        = this;
        this.#setMaxLinesPerPage(this, 'overview_villages', 'units', 1000);
        this.#waitMilliseconds(lastRunTime, 200);
        var lastVillageId = null;

        do {
            lastRunTime = Date.now();
            var overviewTroopsPage = $.parseHTML(this.#fetchHtmlPage(this.#generateUrl('overview_villages', 'units', { page: currentPage })));
            var troopsTable        = $(overviewTroopsPage).find('#units_table tbody');

            var lastVillageIdTemp = $(troopsTable).find('span').eq(0).attr('data-id');
            if (lastVillageId !== null && lastVillageId === lastVillageIdTemp) break;
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
            this.#waitMilliseconds(lastRunTime);
        } while (true);

        return troopsObj;
    }

    async #setMaxLinesPerPage(obj, screen, mode, value) {
        await new Promise(res => setTimeout(res, Math.max(200, 0)));
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

    #getGroupsObj() {
        var html   = $.parseHTML(this.#fetchHtmlPage(this.#generateUrl('overview_villages', 'groups', { type: 'static' })));
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

    async #createUI() {
        UI.InfoMessage('A carregar...');
        this._troopsObj = this.isScavengingWorld
            ? await this.#getTroopsScavengingWorldObj()
            : await this.#getTroopsNonScavengingWorldObj();

        this._totalTroops = this.#calcTotal(this._troopsObj);

        var html = this.#buildHtml(this._troopsObj, this._totalTroops);
        Dialog.show('defesa_disponivel', html, Dialog.close());
        $('#popup_box_defesa_disponivel').css('width', 'unset');

        var self = this;
        $('#sendToDiscord').on('click', function () {
            self.#sendToDiscord(self._totalTroops, self._troopsObj);
        });

        UI.SuccessMessage('Carregado com sucesso!', 500);
    }

    #calcTotal(troopsObj) {
        var total = {};
        var self  = this;
        this.availableSupportUnits.forEach(function (unit) {
            total[unit] = (troopsObj.villagesTroops[unit] || 0) + (troopsObj.scavengingTroops[unit] || 0);
        });
        return total;
    }

    #buildHtml(troopsObj, totalTroops) {
        var self   = this;
        var groups = this.#getGroupsObj();

        // Groups dropdown
        var groupsHtml = '<select onchange="defesaDisponivel.changeGroup(this)">';
        $.each(groups, function (groupId, group) {
            var selected = game_data.group_id === groupId ? 'selected' : '';
            groupsHtml += '<option value="' + groupId + '" ' + selected + '>' + group + '</option>';
        });
        groupsHtml += '</select>';

        // Header
        var headerHtml = '<tr><th class="center" style="width:0px;"></th>';
        this.availableSupportUnits.forEach(function (unit) {
            headerHtml += '<th style="text-align:center" width="35"><a href="#" class="unit_link" data-unit="' + unit + '"><img src="https://dspt.innogamescdn.com/asset/2a2f957f/graphic/unit/unit_' + unit + '.png"></a></th>';
        });
        headerHtml += '</tr>';

        // Rows
        var rowHome  = self.#buildRow('Em casa',   troopsObj.villagesTroops);
        var rowSca   = self.isScavengingWorld ? self.#buildRow('Em busca', troopsObj.scavengingTroops) : '';
        var rowTotal = self.#buildRow('Total',     totalTroops);

        return `
<div>
  <br>
  <h3>${this.isScavengingWorld ? 'Contador de tropas em casa e em buscas' : 'Contador de tropas em casa'}</h3>
  ${groupsHtml}
  <br><br>
  <table id="support_sum" class="vis overview_table" width="100%">
    <thead>${headerHtml}</thead>
    <tbody>
      ${this.isScavengingWorld ? rowHome : ''}
      ${rowSca}
      ${rowTotal}
    </tbody>
  </table>
  <br>
  <button id="sendToDiscord" style="
    display:block; margin:0 auto; padding:8px 16px;
    background:linear-gradient(to bottom,#f2e5b6,#d6c58a);
    border:1px solid #b59e4c; border-radius:6px;
    color:#383020; font-weight:bold; font-size:14px;
    cursor:pointer; transition:transform .2s,box-shadow .2s;">
    <img src="https://i.imgur.com/sJM14FI.png" style="max-width:28px;max-height:28px;vertical-align:middle;margin-right:8px;">
    Partilhar defesa disponível no ticket
  </button>
  <br>
  <span style="font-size:10px;font-weight:bold;">Defesa Disponivel v1.0 por Doritooz / Olympus</span>
</div>
<style>
  .popup_box_content { min-width:600px; }
  .mds .popup_box_content { min-width:unset !important; }
  #sendToDiscord:hover { background:linear-gradient(to bottom,#e7d49f,#c9b16f); transform:translateY(-2px); box-shadow:0 4px 8px rgba(0,0,0,.2); }
  #sendToDiscord:active { transform:translateY(0); box-shadow:0 2px 4px rgba(0,0,0,.2); }
</style>`;
    }

    #buildRow(label, troopsObj) {
        var html = '<tr><td class="center" style="text-wrap:nowrap;">' + label + '</td>';
        this.availableSupportUnits.forEach(function (unit) {
            html += '<td class="center" data-unit="' + unit + '">' + (troopsObj[unit] || 0) + '</td>';
        });
        html += '</tr>';
        return html;
    }

    #sendToDiscord(totalTroops, troopsObj) {
        if (typeof webhookURL !== 'string' || !webhookURL.startsWith('https://discord.com/api/webhooks/')) {
            alert('❌ Webhook inválido. Por favor insere o teu webhook no marcador.');
            return;
        }

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
            { name: '<:CavalariaPesada:1490679597837320362> **Cavalaria Pesada**',          value: '' + totalTroops.heavy,         inline: true  },
            { name: '<:Catapulta:1490679560830976061> **Catapultas**',                      value: '' + totalTroops.catapult,      inline: true  }
        );

        if (hasKnight) {
            fields.push({ name: '<:Paladino:1490679690871177247> **Paladinos**',            value: '' + (totalTroops.knight || 0), inline: true });
        }

        // Se for mundo com buscas, adiciona linha de em casa vs em busca
        var extraContent = '';
        if (this.isScavengingWorld) {
            extraContent = '\n**Em casa:** ' + troopsObj.villagesTroops.spear + ' lanças | **Em busca:** ' + troopsObj.scavengingTroops.spear + ' lanças';
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

    changeGroup(obj) {
        this.#fetchHtmlPage(this.#generateUrl('overview_villages', null, { group: obj.value }));
        game_data.group_id = obj.value;
        this.#createUI();
    }
}

var defesaDisponivel = new DefesaDisponivel();
defesaDisponivel.init();
}
