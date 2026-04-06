if (typeof DEBUG !== 'boolean') DEBUG = false;

var scriptConfig = {
  scriptData: {
    prefix:    'ownHomeTroopsCount',
    name:      'Own Home Troops Count',
    version:   'v1',
    author:    'Doritooz - discord: imRevo',
    authorUrl: 'https://tribalwars.com.pt/',
    helpLink:  'https://tribalwars.com.pt/'
  },
  translations: {
    pt_PT: {
      'Own Home Troops Count': 'Contagem de Tropa em Casa',
      'Redirecting...':        'Redirecionando...',
      'There was an error!':   'Ocorreu um erro inesperado!'
    }
  },
  allowedMarkets: [],
  allowedScreens: ['overview_villages'],
  allowedModes:   ['combined'],
  isDebug:        DEBUG,
  enableCountApi: true
};

$.getScript(
  'https://twscripts.dev/scripts/twSDK.js?url=' + document.currentScript.src,
  async function () {
    await twSDK.init(scriptConfig);

    $('<style>').prop('type', 'text/css').html(`
      #sendToDiscord.btn-twf {
        display: block;
        transition: transform 0.2s, box-shadow 0.2s;
        margin: 20px auto;
        padding: 8px 16px;
        background: linear-gradient(to bottom, #f2e5b6 0%, #d6c58a 100%);
        border: 1px solid #b59e4c;
        border-radius: 6px;
        color: #383020;
        font-weight: bold;
        font-size: 14px;
        text-shadow: 0 1px 0 rgba(255,255,255,0.6);
        cursor: pointer;
      }
      #sendToDiscord.btn-twf:hover {
        background: linear-gradient(to bottom, #e7d49f 0%, #c9b16f 100%);
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      }
      #sendToDiscord.btn-twf:active {
        transform: translateY(0);
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      #sendToDiscord.btn-twf img {
        max-width: 36px;
        max-height: 36px;
        width: auto;
        height: auto;
        vertical-align: middle;
        margin-right: 8px;
      }
    `).appendTo('head');

    const scriptInfo    = twSDK.scriptInfo();
    const isValidScreen = twSDK.checkValidLocation('screen');
    const isValidMode   = twSDK.checkValidLocation('mode');

    (function () {
      try {
        if (game_data.features.Premium.active) {
          if (isValidScreen && isValidMode) {
            buildUI();
          } else {
            UI.InfoMessage('Redirecionando...');
            twSDK.redirectTo('overview_villages&mode=combined');
          }
        } else {
          UI.ErrorMessage('É necessário ter conta Premium para usar este script!');
        }
      } catch (error) {
        UI.ErrorMessage('Ocorreu um erro inesperado!');
        console.error(scriptInfo + ' Error:', error);
      }
    })();

    function buildUI() {
      const homeTroops      = collectTroopsAtHome();
      const totalTroops     = getTotalHomeTroops(homeTroops);
      const bbCode          = getTroopsBBCode(totalTroops);
      const content         = prepareContent(totalTroops, bbCode);

      twSDK.renderBoxWidget(content, scriptConfig.scriptData.prefix, 'ra-own-home-troops-count');

      jQuery('#sendToDiscord').remove();
      jQuery('.ra-own-home-troops-count').append(`
        <button id="sendToDiscord" class="btn-twf">
          <img src="https://i.imgur.com/8n7jRL9.png" alt="TWF">
          Partilhar defesa disponível no ticket
        </button>
      `);
      jQuery('#sendToDiscord').on('click', function () {
        sendToDiscord(totalTroops);
      });

      setTimeout(function () {
        if (!game_data.units.includes('archer'))  jQuery('.archer-world').hide();
        if (!game_data.units.includes('knight'))  jQuery('.paladin-world').hide();
      }, 100);
    }

    function sendToDiscord(t) {
      if (typeof webhookURL !== 'string' || !webhookURL.startsWith('https://discord.com/api/webhooks/')) {
        alert('❌ Webhook inválido. Por favor insere o teu webhook no marcador.');
        return;
      }

      var playerName   = game_data.player.name;
      var currentGroup = jQuery('strong.group-menu-item').text();
      var serverTime   = getServerTime();

      var fields = [
        { name: '🗂️ **Grupo Atual**',                                              value: currentGroup,       inline: false },
        { name: '<:Lanceiro:1490679628149424158> **Lanceiros**',                    value: '' + t.spear,       inline: true  },
        { name: '<:Espadachim:1490679660915327067> **Espadachins**',                value: '' + t.sword,       inline: true  },
        { name: '<:Arqueiro:1490679499623370752> **Arqueiros**',                    value: '' + (t.archer||0), inline: true  },
        { name: '<:Batedor:1490679522943701002> **Batedores**',                     value: '' + t.spy,         inline: true  },
        { name: '<:CavalariaPesada:1490679597837320362> **Cavalaria Pesada**',      value: '' + t.heavy,       inline: true  },
        { name: '<:Catapulta:1490679560830976061> **Catapultas**',                  value: '' + t.catapult,    inline: true  },
        { name: '<:Paladino:1490679690871177247> **Paladinos**',                    value: '' + (t.knight||0), inline: true  }
      ];

      // Esconde Arqueiro se o mundo não tiver arqueiros
      if (!game_data.units.includes('archer')) {
        fields = fields.filter(function (f) { return !f.name.includes('Arqueiro'); });
      }
      // Esconde Paladino se o mundo não tiver paladino
      if (!game_data.units.includes('knight')) {
        fields = fields.filter(function (f) { return !f.name.includes('Paladino'); });
      }

      var payload = {
        content: '**Tropa Defensiva (Atualizado em: ' + serverTime + ')**\n**Jogador:** ' + playerName,
        embeds: [{
          title:  '**🛡️ TROPA DEFENSIVA**',
          fields: fields
        }]
      };

      $.ajax({
        url:         webhookURL,
        method:      'POST',
        contentType: 'application/json',
        data:        JSON.stringify(payload),
        success: function () {
          alert('✅ Defesa partilhada com sucesso!');
        },
        error: function () {
          alert('❌ Erro ao enviar para o Discord.');
        }
      });
    }

    function prepareContent(t, bbCode) {
      return `
        <div class="ra-mb15">
          <h4>Tropas de Ataque</h4>
          <table width="100%" class="ra-table">
            <thead><tr>
              <th width="14.2%"><img src="/graphic/unit/unit_axe.webp"></th>
              <th width="14.2%"><img src="/graphic/unit/unit_light.webp"></th>
              <th width="14.2%" class="archer-world"><img src="/graphic/unit/unit_marcher.webp"></th>
              <th width="14.2%"><img src="/graphic/unit/unit_ram.webp"></th>
              <th width="14.2%"><img src="/graphic/unit/unit_catapult.webp"></th>
              <th width="14.2%" class="paladin-world"><img src="/graphic/unit/unit_knight.webp"></th>
              <th width="14.2%"><img src="/graphic/unit/unit_snob.webp"></th>
            </tr></thead>
            <tbody><tr>
              <td>${twSDK.formatAsNumber(t.axe)}</td>
              <td>${twSDK.formatAsNumber(t.light)}</td>
              <td class="archer-world">${twSDK.formatAsNumber(t.marcher)}</td>
              <td>${twSDK.formatAsNumber(t.ram)}</td>
              <td>${twSDK.formatAsNumber(t.catapult)}</td>
              <td class="paladin-world">${twSDK.formatAsNumber(t.knight)}</td>
              <td>${twSDK.formatAsNumber(t.snob)}</td>
            </tr></tbody>
          </table>
        </div>
        <div class="ra-mb15">
          <h4>Tropas Defensivas</h4>
          <table width="100%" class="ra-table">
            <thead><tr>
              <th width="14.2%"><img src="/graphic/unit/unit_spear.webp"></th>
              <th width="14.2%"><img src="/graphic/unit/unit_sword.webp"></th>
              <th width="14.2%" class="archer-world"><img src="/graphic/unit/unit_archer.webp"></th>
              <th width="14.2%"><img src="/graphic/unit/unit_spy.webp"></th>
              <th width="14.2%"><img src="/graphic/unit/unit_heavy.webp"></th>
              <th width="14.2%"><img src="/graphic/unit/unit_catapult.webp"></th>
              <th width="14.2%" class="paladin-world"><img src="/graphic/unit/unit_knight.webp"></th>
            </tr></thead>
            <tbody><tr>
              <td>${twSDK.formatAsNumber(t.spear)}</td>
              <td>${twSDK.formatAsNumber(t.sword)}</td>
              <td class="archer-world">${twSDK.formatAsNumber(t.archer)}</td>
              <td>${twSDK.formatAsNumber(t.spy)}</td>
              <td>${twSDK.formatAsNumber(t.heavy)}</td>
              <td>${twSDK.formatAsNumber(t.catapult)}</td>
              <td class="paladin-world">${twSDK.formatAsNumber(t.knight)}</td>
            </tr></tbody>
          </table>
        </div>
        <div>
          <h4>Exportar Contagem de Tropas</h4>
          <textarea readonly class="ra-textarea">${bbCode.trim()}</textarea>
        </div>
      `;
    }

    function collectTroopsAtHome() {
      var header = [];
      jQuery('#combined_table tr:eq(0) th').each(function () {
        var src = jQuery(this).find('img').attr('src');
        if (src) {
          var name = src.split('/').pop().replace('.webp', '');
          header.push(name);
        } else {
          header.push(null);
        }
      });

      var rows = [];
      jQuery('#combined_table tr.nowrap').each(function () {
        var row = {};
        var $tds = jQuery(this).find('td');
        header.forEach(function (h, i) {
          if (h && h.includes('unit_')) {
            var unit = h.replace('unit_', '');
            row[unit] = parseInt($tds.eq(i).text()) || 0;
          }
        });
        rows.push(row);
      });
      return rows;
    }

    function getTotalHomeTroops(rows) {
      var total = {
        spear: 0, sword: 0, axe: 0, archer: 0,
        spy: 0, light: 0, marcher: 0, heavy: 0,
        ram: 0, catapult: 0, knight: 0, snob: 0
      };
      rows.forEach(function (r) {
        Object.keys(total).forEach(function (k) {
          total[k] += (r[k] || 0);
        });
      });
      if (!game_data.units.includes('archer')) { delete total.archer; delete total.marcher; }
      if (!game_data.units.includes('knight')) { delete total.knight; }
      return total;
    }

    function getTroopsBBCode(t) {
      var currentGroup = jQuery('strong.group-menu-item').text();
      var labels = {
        spear: 'Lanceiros', sword: 'Espadachins', axe: 'Vikings',
        archer: 'Arqueiros', spy: 'Batedores', light: 'Cavalaria Leve',
        marcher: 'Arqueiros Montados', heavy: 'Cavalaria Pesada',
        ram: 'Arietes', catapult: 'Catapultas', knight: 'Paladinos', snob: 'Nobres'
      };
      var bb = '[b]Contagem de Tropas em Casa (' + getServerTime() + ')[/b]\n';
      bb += '[b]Grupo Atual:[/b] ' + currentGroup + '\n\n';
      Object.entries(t).forEach(function ([k, v]) {
        bb += '[unit]' + k + '[/unit] [b]' + twSDK.formatAsNumber(v) + '[/b] ' + (labels[k] || '') + '\n';
      });
      return bb;
    }

    function getServerTime() {
      return jQuery('#serverDate').text() + ' ' + jQuery('#serverTime').text();
    }
  }
);
