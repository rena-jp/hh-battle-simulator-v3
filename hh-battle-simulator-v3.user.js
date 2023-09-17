// ==UserScript==
// @name         Hentai Heroes Battle Simulator v3
// @namespace    https://github.com/rena-jp/hh-battle-simulator-v3
// @version      3.1
// @description  Add a battle simulator to Hentai Heroes and related games
// @author       rena
// @match        https://*.hentaiheroes.com/*
// @match        https://nutaku.haremheroes.com/*
// @match        https://*.gayharem.com/*
// @match        https://*.comixharem.com/*
// @match        https://*.hornyheroes.com/*
// @match        https://*.pornstarharem.com/*
// @match        https://*.transpornstarharem.com/*
// @grant        none
// @run-at       document-body
// @updateURL    https://github.com/rena-jp/hh-battle-simulator-v3/raw/main/hh-battle-simulator-v3.user.js
// @downloadURL  https://github.com/rena-jp/hh-battle-simulator-v3/raw/main/hh-battle-simulator-v3.user.js
// ==/UserScript==

window.HHBattleSimulator = {
    /**
     * @param {*} playerRawData - hero_data
     * @param {*} opponentRawData - opponent_fighter.player
     * @returns {Promise<{ chance: number, alwaysWin: boolean, neverWin: boolean, avgPoints: number, minPoints: number, maxPoints: number }>} - Player's winning chance and league points
     */
    async simulateFromFighters(playerRawData, opponentRawData) {
        const player = calcBattleDataFromFighters(playerRawData, opponentRawData);
        const opponent = calcBattleDataFromFighters(opponentRawData, playerRawData);
        return await simulateFromBattleData(player, opponent);
    },
    /**
     * @param {*} playerTeam - hero_data.team
     * @param {*} opponentTeam - opponent_fighter.player.team
     * @param {number} mythicBoosterMultiplier - Default: 1, AME/LME/SME: 1.15, Headband: 1.25
     * @returns {Promise<{ chance: number, alwaysWin: boolean, neverWin: boolean, avgPoints: number, minPoints: number, maxPoints: number }>} - Player's winning chance and league points
     */
    async simulateFromTeams(playerTeam, opponentTeam, mythicBoosterMultiplier) {
        const player = calcBattleDataFromTeams(playerTeam, opponentTeam, mythicBoosterMultiplier);
        const opponent = calcBattleDataFromTeams(opponentTeam, playerTeam);
        return await simulateFromBattleData(player, opponent);
    },
};

const workerScript = (() => {
    self.addEventListener('message', e => {
        const { func, args } = e.data;
        const f = self[func];
        const ret = f(...args);
        self.postMessage({ func, ret });
    });

    function simulate(player, opponent) {
        player.win = playerEgo => createResult(1, true, false, Math.ceil(10 * playerEgo / player.ego) + 15);
        opponent.win = opponentEgo => createResult(0, false, true, Math.ceil(10 * (opponent.ego - opponentEgo) / (opponent.ego)) + 3);
        player.shieldEndurance = Math.ceil(player.ego * player.shield);
        opponent.shieldEndurance = Math.ceil(opponent.ego * opponent.shield);
        player.deathThreshold = player.ego * opponent.execute;
        opponent.deathThreshold = opponent.ego * player.execute;
        return attack(player, player.ego, player.attack, player.defense, 0, opponent, opponent.ego, opponent.attack, opponent.defense, 0);

        function createResult(chance, alwaysWin, neverWin, points) {
            return {
                chance,
                alwaysWin,
                neverWin,
                avgPoints: points,
                minPoints: points,
                maxPoints: points,
            };
        }

        function mergeResult(xResult, xChance, yResult, yChance) {
            return {
                chance: xResult.chance * xChance + yResult.chance * yChance,
                alwaysWin: xResult.alwaysWin && yResult.alwaysWin,
                neverWin: xResult.neverWin && yResult.neverWin,
                avgPoints: xResult.avgPoints * xChance + yResult.avgPoints * yChance,
                minPoints: Math.min(xResult.minPoints, yResult.minPoints),
                maxPoints: Math.max(xResult.maxPoints, yResult.maxPoints),
            };
        }

        function attack(attacker, attackerEgo, attackerAttack, attackerDefense, attackerSkill, defender, defenderEgo, defenderAttack, defenderDefense, defenderSkill) {
            attackerAttack *= attacker.attackMultiplier;
            defenderDefense *= attacker.defenseMultiplier;
            const baseDamage = Math.max(0, Math.floor(attackerAttack - defenderDefense));
            const baseResult = hit(attacker, attackerEgo, attackerAttack, attackerDefense, attackerSkill, defender, defenderEgo, defenderAttack, defenderDefense, defenderSkill, baseDamage);
            const critDamage = baseDamage * attacker.critMultiplier;
            const critResult = hit(attacker, attackerEgo, attackerAttack, attackerDefense, attackerSkill, defender, defenderEgo, defenderAttack, defenderDefense, defenderSkill, critDamage);
            return mergeResult(baseResult, attacker.baseHitChance, critResult, attacker.critHitChance);
        }

        function hit(attacker, attackerEgo, attackerAttack, attackerDefense, attackerSkill, defender, defenderEgo, defenderAttack, defenderDefense, defenderSkill, damage) {
            const roundedDamage = Math.ceil(damage);
            let shieldDamage = 0;
            if (defender.shield && 1 <= defenderSkill && defenderSkill <= defender.shieldEndurance) {
                const remainingShieald = defender.shieldEndurance - (defenderSkill - 1);
                shieldDamage = Math.min(roundedDamage, remainingShieald);
                defenderSkill += shieldDamage;
            }

            const egoDamage = roundedDamage - shieldDamage;
            defenderEgo -= Math.ceil(egoDamage);

            attackerEgo += Math.ceil(egoDamage * attacker.healing);
            attackerEgo = Math.min(attackerEgo, attacker.ego);

            let executionDamage = 0;
            if (attacker.execute && defenderEgo <= defender.deathThreshold) {
                executionDamage = defenderEgo;
                defenderEgo = 0;
            }

            if (defender.reflect && 1 <= defenderSkill && defenderSkill <= 2) {
                defenderSkill++;
                const reflectedDamage = Math.ceil((egoDamage + executionDamage) * defender.reflect);

                let reflectedDamageToShield = 0;
                if (attacker.shield && 1 <= attackerSkill && attackerSkill <= attacker.shieldEndurance) {
                    reflectedDamageToShield = Math.min(Math.ceil(reflectedDamage), attacker.shieldEndurance - (attackerSkill - 1));
                    attackerSkill += reflectedDamageToShield;
                }

                const reflectedDamageToEgo = reflectedDamage - reflectedDamageToShield;
                attackerEgo -= reflectedDamageToEgo;
                if (attackerEgo <= 0) {
                    // TODO: I suspect the game do nothing.
                }
            }

            if (defenderEgo <= 0) return attacker.win(Math.min(attackerEgo, attacker.ego));

            if (attacker.stun && attackerSkill === 1) {
                attackerSkill++;
                return attack(attacker, attackerEgo, attackerAttack, attackerDefense, attackerSkill, defender, defenderEgo, defenderAttack, defenderDefense, defenderSkill);
            }

            if (attacker.reflect && attackerSkill === 0) attackerSkill = 1;

            if (attacker.shield && attackerSkill === 0) attackerSkill = 1;

            const result = attack(defender, defenderEgo, defenderAttack, defenderDefense, defenderSkill, attacker, attackerEgo, attackerAttack, attackerDefense, attackerSkill);

            if (attacker.stun && attackerSkill === 0) {
                attackerSkill = 1;
                const stunningResult = attack(attacker, attackerEgo, attackerAttack, attackerDefense, attackerSkill, defender, defenderEgo, defenderAttack, defenderDefense, defenderSkill);
                return mergeResult(stunningResult, attacker.stun, result, 1 - attacker.stun);
            }

            return result;
        }
    }
}).toString().slice(6);

const workerBlob = new Blob([workerScript], { type: 'text/javascript' });
const workerURL = URL.createObjectURL(workerBlob);
const maxWorkers = navigator?.hardwareConcurrency ?? 1;
const minWorkers = 1;
let runningWorkers = 0;
const waiterQueue = [];
const workerPool = [];

async function getWorker() {
    const worker = workerPool.pop();
    if (worker != null) {
        return worker;
    } else if (runningWorkers < maxWorkers) {
        runningWorkers++;
        return new Worker(workerURL);
    } else {
        return new Promise(resolve => {
            waiterQueue.push(resolve);
        });
    }
}

function releaseWorker(worker) {
    const waiter = waiterQueue.shift();
    if (waiter != null) {
        waiter(worker);
    } else if (workerPool.length < minWorkers) {
        workerPool.push(worker);
    } else {
        worker.terminate();
        runningWorkers--;
    }
}

async function workerRun(func, args) {
    const worker = await getWorker();
    const promise = new Promise((resolve, reject) => {
        worker.addEventListener('message', e => { resolve(e.data.ret); });
        worker.addEventListener("messageerror", e => { reject(e); });
        worker.addEventListener('error', e => { reject(e); });
    });
    promise.then(() => { releaseWorker(worker); });
    worker.postMessage({ func, args });
    return promise;
}

async function simulateFromBattleData(player, opponent) {
    return await workerRun('simulate', [player, opponent]);
}

function calcBattleDataFromFighters(fighterRawData, opponentRawData) {
    const { team } = fighterRawData;
    const { girls } = team;

    const synergyBonuses = Object.fromEntries(
        team.synergies.map(e => [e.element.type, e.bonus_multiplier])
    );

    let chance = 0.30 * fighterRawData.chance / (fighterRawData.chance + opponentRawData.chance);
    chance += synergyBonuses.stone;

    const chanceDominations = ['darkness', 'light', 'psychic'];
    const opponentTeamTheme = opponentRawData.team.theme;
    team.theme_elements.forEach(e => {
        if (chanceDominations.includes(e.type) && opponentTeamTheme.includes(e.domination)) {
            chance += 0.2;
        }
    });

    const getSkillPercentage = id => girls
        .map(e => e.skills[id]?.skill.percentage_value ?? 0)
        .reduce((p, c) => p + c, 0) / 100;

    const centerGirlSkills = girls[0]?.skills;
    const get5thSkillPercentage = id => (centerGirlSkills?.[id]?.skill.percentage_value ?? parseFloat(centerGirlSkills?.[id]?.skill.display_value_text ?? 0)) / 100;

    return {
        ego: Math.ceil(fighterRawData.remaining_ego),
        attack: fighterRawData.damage,
        defense: fighterRawData.defense,
        baseHitChance: 1 - chance,
        critHitChance: chance,
        critMultiplier: 2 + synergyBonuses.fire,
        healing: synergyBonuses.water,
        attackMultiplier: 1 + getSkillPercentage(9),
        defenseMultiplier: 1 + getSkillPercentage(10),
        stun: get5thSkillPercentage(11),
        shield: get5thSkillPercentage(12),
        reflect: get5thSkillPercentage(13),
        execute: get5thSkillPercentage(14),
    };
}

function calcBattleDataFromTeams(fighterTeam, opponentTeam, mythicBoosterMultiplier) {
    const checklist = ['fire', 'nature', 'stone', 'sun', 'water'];
    let damageMultiplier = mythicBoosterMultiplier ?? 1;
    let egoMultiplier = 1;
    fighterTeam.theme_elements.forEach(e => {
        if (opponentTeam.theme.includes(e.domination) && checklist.includes(e.domination)) {
            damageMultiplier += 0.1;
            egoMultiplier += 0.1;
        }
    });
    const opponentSynergyBonuses = Object.fromEntries(
        opponentTeam.synergies.map(e => [e.element.type, e.bonus_multiplier])
    );
    const defenseDecreasing = opponentSynergyBonuses.sun;
    const caracs = fighterTeam.caracs;
    return calcBattleDataFromFighters(
        {
            damage: Math.ceil(caracs.damage * damageMultiplier),
            defense: caracs.defense - Math.ceil(caracs.defense * defenseDecreasing),
            remaining_ego: Math.ceil(caracs.ego * egoMultiplier),
            chance: caracs.chance,
            team: fighterTeam,
        },
        {
            chance: opponentTeam.caracs.chance,
            team: opponentTeam,
        }
    );
}

function checkPage(...args) {
    return args.some(e => window.location.pathname.includes(e));
}

function toRoundedNumber(value, m) {
    return Math.round(value * m) / m;
}

function toPercentage(value) {
    const percentage = 100 * value;
    if (percentage > 99.99) return '100%';
    if (percentage >= 99.9) return '99.9%';
    if (percentage >= 10) return `${toRoundedNumber(percentage, 10)}%`;// 10%-99.9%
    if (percentage >= 0.01) return `${toRoundedNumber(percentage, 100)}%`;// 0.01%-9.99%
    if (percentage >= 9.5e-4) return `${percentage.toPrecision(1)}%`; // 0.001%-0.01%
    return '0%';
};

function getRiskColor(chance) {
    const value = (Math.min(1, chance) ** 3) * 2;
    const red = Math.round(255 * Math.sqrt(Math.min(1, 2 - value)));
    const green = Math.round(255 * Math.sqrt(Math.min(1, value)));
    return `rgb(${red}, ${green}, 0)`;
}

function getMojoColor(mojo) {
    const rate = Math.max(0, Math.min(40, mojo + 10)) / 40;
    const value = 1 + Math.sin(Math.PI * (rate * rate - 0.5));
    const red = Math.round(255 * Math.sqrt(Math.min(1, 2 - value)));
    const green = Math.round(255 * Math.sqrt(Math.min(1, value)));
    return `rgb(${red}, ${green}, 0)`;
}

const TableHelper = (() => {
    const column = (span, content) => span >= 2 ? `<td colspan="${span}">${content}</td>` : `<td>${content}</td>`;
    const columns = (span, contents) => contents.map(e => column(span, e)).join('');
    const row = (...args) => ['<tr>', ...args, '</tr>'].join('');
    return { column, columns, row };
})();

function createChanceElement$(resultPromise, player, opponent) {
    const $element = $('<div class="sim-result"></div>');
    queueMicrotask(update);
    return $element
        .addClass('sim-pending')
        .html('<div class="sim-label">P[W]:</div>-')
        .attr('tooltip', createBattleTable());

    async function update() {
        const result = await resultPromise;
        const question = result.hasAssumptions ? '?' : '';
        let mark = '';
        if (result.alwaysWin) mark = '<div class="vCheck_mix_icn sim-mark"></div>';
        if (result.neverWin) mark = '<div class="xUncheck_mix_icn sim-mark"></div>';
        $element
            .removeClass('sim-pending')
            .html(`<div class="sim-label">P[W]:</div>${mark}<span class="sim-chance">${toPercentage(result.chance)}${question}</span>`)
            .css('color', getRiskColor(result.chance));
    }

    function createBattleTable() {
        const { column, columns, row } = TableHelper;
        const createTable = (attacker, defender) => {
            let attackerAttack = attacker.attack;
            let defenderDefense = defender.defense;
            const rows = [];
            for (let i = 0; i < 10; i++) {
                const baseDamage = Math.max(0, Math.floor(attackerAttack - defenderDefense));
                const columns = [];
                columns.push(baseDamage);
                columns.push(Math.ceil(baseDamage * attacker.healing));
                columns.push(Math.ceil(baseDamage * attacker.critMultiplier));
                columns.push(Math.ceil(baseDamage * attacker.critMultiplier * attacker.healing));
                rows.push(columns);
                attackerAttack *= attacker.attackMultiplier;
                defenderDefense *= attacker.defenseMultiplier;
            }
            return rows;
        };
        const playerTable = createTable(player, opponent);
        const opponentTable = createTable(opponent, player);
        const chanceRow = [player, opponent].flatMap(e => [e.baseHitChance, e.critHitChance]);
        return $('<table class="sim-table"></table>')
            .append(row(column(1, ''), columns(4, ['Player', 'Opponent'])))
            .append(row(column(1, ''), columns(2, ['Normal', 'Critical']).repeat(2)))
            .append(row(column(1, '%'), columns(2, chanceRow.map(e => toPercentage(e)))))
            .append(row(column(1, ''), columns(1, ['Damage', 'Healing']).repeat(4)))
            .append(
                Array(9).fill().map((_, i) => i + 1)
                    .map(i => row(
                        column(1, i),
                        [playerTable, opponentTable].map(table => columns(1, table[i].map(e => e.toLocaleString()))),
                    ))
            )
            .prop('outerHTML');
    }
}

function createMojoElement$(resultPromise, winMojo) {
    const $element = $('<div class="sim-result"></div>')
        .addClass('sim-pending')
        .html('<div class="sim-label">E[M]:</div>-');
    queueMicrotask(update);
    return $element;

    async function update() {
        const result = await resultPromise;
        const question = result.hasAssumptions ? '?' : '';
        const winChance = result.chance;
        const lossChance = 1 - winChance;
        const lossMojo = winMojo - 40;
        const odds = winMojo * winChance + lossMojo * lossChance;
        $element
            .removeClass('sim-pending')
            .html(`<div class="sim-label">E[M]:</div><span class="sim-mojo">${toRoundedNumber(odds, 100)}${question}</span>`)
            .css('color', getMojoColor(odds))
            .attr('tooltip', createMojoTable());

        function createMojoTable() {
            const { column, columns, row } = TableHelper;
            return $('<table class="sim-table"></table>')
                .append(row(column(1, ''), columns(1, ['Win', 'Loss'])))
                .append(row(column(1, 'Mojo'), columns(1, [winMojo, lossMojo].map(e => toRoundedNumber(e, 100)))))
                .append(row(column(1, '%'), columns(1, [winChance, lossChance].map(e => toPercentage(e)))))
                .append(row(column(1, 'E[M]'), column(2, toRoundedNumber(odds, 100))))
                .prop('outerHTML');
        }
    }
}

function createLeaguePointsElement$(resultPromise) {
    const $element = $('<div class="sim-result"></div>')
        .addClass('sim-pending')
        .html('<div class="sim-label">E[P]:</div>-');
    queueMicrotask(update);
    return $element;

    async function update() {
        const result = await resultPromise;
        const question = result.hasAssumptions ? '?' : '';
        let mark = '';
        if (result.minPoints >= 25) mark = '<div class="vCheck_mix_icn sim-mark"></div>';
        $element
            .removeClass('sim-pending')
            .html(`<div class="sim-label">E[P]:</div>${mark}<span class="sim-points">${toRoundedNumber(result.avgPoints, 100)}${question}</span>`)
            .css('color', getRiskColor(result.avgPoints / 25))
            .attr('tooltip', createPointsTable());

        function createPointsTable() {
            const { column, columns, row } = TableHelper;
            return $('<table class="sim-table"></table>')
                .append(row(column(3, 'Points')))
                .append(row(columns(1, ['Min', 'Avg', 'Max'])))
                .append(row(columns(1, [result.minPoints, result.avgPoints, result.maxPoints].map(e => toRoundedNumber(e, 100)))))
                .prop('outerHTML');
        }
    }
}

(async function main() {
    if (document.readyState === 'loading') {
        await new Promise(resolve => {
            window.addEventListener('DOMContentLoaded', () => {
                resolve();
            }, { capture: true, once: true });
        });
    }

    if (!window.$) throw new Error('jQuery is not found.');
    /* global $ */
    if (typeof localStorageGetItem !== 'function') throw new Error('localStorageGetItem is not found');
    /* global localStorageGetItem */
    if (typeof localStorageSetItem !== 'function') throw new Error('localStorageSetItem is not found');
    /* global localStorageSetItem */

    const afterGameInited = new Promise(resolve => {
        $(() => { resolve(); });
    });

    savePlayerLeaguesTeam();
    saveLastOpponentTeam();
    addStyle();
    addSimulatorAgainstCurrentOpponents();
    addSimulatorAgainstLastOpponent();
    changePowerSortToSimSort();

    async function addSimulatorAgainstCurrentOpponents() {
        if (checkPage('/troll-pre-battle.html', '/pantheon-pre-battle.html')) {
            const { hero_data, opponent_fighter } = window;
            if (!hero_data) throw new Error('hero_data is not found.');
            if (!opponent_fighter) throw new Error('opponents is not found.');
            if (!opponent_fighter.player) throw new Error('opponent_fighter.player is not found.');

            const playerRawData = hero_data;
            const opponentRawData = opponent_fighter.player;
            const player = calcBattleDataFromFighters(playerRawData, opponentRawData);
            const opponent = calcBattleDataFromFighters(opponentRawData, playerRawData);
            const resultPromise = simulateFromBattleData(player, opponent);

            await afterGameInited;

            $('.opponent .icon-area')
                .before(createChanceElement$(resultPromise, player, opponent).addClass('sim-left'));
        }

        if (checkPage('/leagues-pre-battle.html')) {
            const { hero_data, opponent_fighter } = window;
            if (!hero_data) throw new Error('hero_data is not found.');
            if (!opponent_fighter) throw new Error('opponent_fighter is not found.');
            if (!opponent_fighter.player) throw new Error('opponent_fighter.player is not found.');

            const playerRawData = hero_data;
            const opponentRawData = opponent_fighter.player;
            const player = calcBattleDataFromFighters(playerRawData, opponentRawData);
            const opponent = calcBattleDataFromFighters(opponentRawData, playerRawData);
            const resultPromise = simulateFromBattleData(player, opponent);

            await afterGameInited;

            $('.opponent .icon-area')
                .before(createChanceElement$(resultPromise, player, opponent).addClass('sim-left'))
                .before(createLeaguePointsElement$(resultPromise).addClass('sim-right'));
        }

        if (checkPage('/season-arena.html')) {
            const { hero_data, caracs_per_opponent, opponents } = window;
            if (!hero_data) throw new Error('hero_data is not found.');
            if (!caracs_per_opponent) throw new Error('caracs_per_opponent is not found.');
            if (!opponents) throw new Error('opponents is not found.');
            if (opponents.some(e => !e.player)) throw new Error('opponents[].player is not found.');

            opponents.forEach(async opponent_fighter => {
                const opponentRawData = opponent_fighter.player;
                const opponentId = opponentRawData.id_fighter;
                const playerRawData = { ...hero_data, ...caracs_per_opponent[opponentId] };
                const player = calcBattleDataFromFighters(playerRawData, opponentRawData);
                const opponent = calcBattleDataFromFighters(opponentRawData, playerRawData);
                const resultPromise = simulateFromBattleData(player, opponent);
                const mojo = +opponent_fighter.rewards.rewards.find(e => e.type === 'victory_points').value;

                await afterGameInited;

                $(`[data-opponent="${opponentId}"] .icon-area`)
                    .before(createChanceElement$(resultPromise, player, opponent).addClass('sim-left'))
                    .before(createMojoElement$(resultPromise, mojo).addClass('sim-right'));
            });
        }

        const avoidOverlap = () => {
            if ($('.matchRating').length > 0) {
                $('.sim-result').addClass('sim-top');
            }
        };
        avoidOverlap();
        const observer = new MutationObserver(avoidOverlap);
        document.querySelectorAll('.player_team_block.opponent, .season_arena_opponent_container').forEach(e => {
            observer.observe(e, { childList: true, subtree: true });
        });
    }

    async function addSimulatorAgainstLastOpponent() {
        if (checkPage('/teams.html')) {
            const { teams_data } = window;
            if (teams_data == null) throw new Error('teams_data is not found.');

            const battleType = localStorageGetItem('battle_type');

            const opponentTeam = getLastOpponentTeam(battleType);
            if (opponentTeam == null) return;

            const mythicBoosterMultiplier = getMythicBoosterMultiplier(battleType);

            const teamMap = Object.fromEntries(
                Object.values(teams_data).filter(e => e.id_team != null && !e.locked).map(playerTeam => {
                    const player = calcBattleDataFromTeams(playerTeam, opponentTeam, mythicBoosterMultiplier);
                    const opponent = calcBattleDataFromTeams(opponentTeam, playerTeam);
                    const resultPromise = simulateFromBattleData(player, opponent);
                    return [playerTeam.id_team, { resultPromise, player, opponent }];
                })
            );

            await afterGameInited;

            update();

            const observer = new MutationObserver(update);

            const teamSelector = document.querySelector('.teams-grid-container');
            if (teamSelector != null) {
                observer.observe(teamSelector, {
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['class'],
                });
            }

            function update() {
                const id = $('.selected-team').data('idTeam');
                const team = teamMap[id];
                if (team == null) return;
                const { resultPromise, player, opponent } = team;
                const $iconArea = $('.team-right-part-container .icon-area');
                $iconArea.before(createChanceElement$(resultPromise, player, opponent).addClass('sim-left'));
                if (battleType === 'leagues') $iconArea.before(createLeaguePointsElement$(resultPromise).addClass('sim-right'));
            }
        }

        if (checkPage('/edit-team.html')) {
            const { hero_data, teamGirls, theme_resonance_bonuses, availableGirls } = window;
            if (hero_data == null) throw new Error('hero_data is not found');
            if (teamGirls == null) throw new Error('teamGirls is not found');
            if (theme_resonance_bonuses == null) throw new Error('theme_resonance_bonuses is not found');
            if (availableGirls == null) throw new Error('availableGirls is not found');

            const battleType = localStorageGetItem('battle_type');

            const opponentTeam = getLastOpponentTeam(battleType);
            if (opponentTeam == null) return;

            const initialTeam = hero_data.team;
            if (initialTeam == null) return;

            const girlsMap = new Map(Object.values(availableGirls).map(e => [e.id_girl, e]));

            const mythicBoosterMultiplier = getMythicBoosterMultiplier(battleType);

            await afterGameInited;

            const elements = Object.fromEntries(initialTeam.synergies.map(e => [e.element.type, e.element]));
            let currentTeam = { ...initialTeam };
            let hasAssumptions = false;

            update();

            const statsContainer = document.querySelector('.player_stats');
            if (statsContainer != null) {
                const observer = new MutationObserver(updateStats);
                observer.observe(statsContainer, {
                    subtree: true,
                    childList: true,
                });
            }

            const centerGirl = document.querySelector('.team-member-container[data-team-member-position="0"]');
            if (centerGirl != null) {
                const observer = new MutationObserver(updateCenterGirl);
                observer.observe(centerGirl, {
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['src'],
                });
            }

            function updateCenterGirl() {
                const centerGirlId = document.querySelector('.team-hexagon [data-girl-id][data-team-member-position="0"]')?.dataset.girlId;
                const centerGirlIndex = currentTeam.girls.findIndex(girl => girl.id_girl == centerGirlId);
                if (centerGirlIndex >= 0) {
                    const girls = currentTeam.girls.slice();
                    const temp = girls[0];
                    girls[0] = girls[centerGirlIndex];
                    girls[centerGirlIndex] = temp;
                    currentTeam.girls = girls;
                    update();
                }
            }

            function updateStats() {
                const separator = window.get_dec_and_sep(window.get_lang()).sep;
                const getStat = e => parseFloat($(`#stats-${e}`).text().trim().replace(separator, ''));
                const caracs = {
                    damage: getStat('damage'),
                    defense: getStat('defense'),
                    ego: getStat('ego'),
                    chance: getStat('chance'),
                };

                const teamMembers = Array.from(document.querySelectorAll('.team-hexagon [data-girl-id]'))
                    .sort((x, y) => x.dataset.teamMemberPosition - y.dataset.teamMemberPosition)
                    .map(e => girlsMap.get(e.dataset.girlId));

                hasAssumptions = false;
                currentTeam.girls = teamMembers.map(e => {
                    const id = e.id_girl;
                    const girlData = teamGirls.find(girl => girl.id_girl == id);
                    if (girlData != null) return { ...e, skills: girlData.skills };

                    const skills = {};
                    const tier4 = e.skill_tiers_info[4]?.skill_points_used ?? 0;
                    if (tier4) {
                        hasAssumptions = true;
                        skills[9] = { skill: { percentage_value: 0.2 * tier4 } };
                        skills[10] = { skill: { percentage_value: 0 } };
                    }
                    const tier5 = e.skill_tiers_info[5]?.skill_points_used ?? 0;
                    if (tier5 > 0) {
                        const element = e.element;
                        if (['darkness', 'sun'].includes(element)) skills[11] = { skill: { percentage_value: 7 * tier5 } }; // stun
                        if (['stone', 'light'].includes(element)) skills[12] = { skill: { percentage_value: 8 * tier5 } }; // shield
                        if (['nature', 'psychic'].includes(element)) skills[13] = { skill: { percentage_value: 20 * tier5 } }; // reflect
                        if (['fire', 'water'].includes(element)) skills[14] = { skill: { percentage_value: 6 * tier5 } }; // execute
                    }
                    return { ...e, skills };
                });

                const elementCounts = Object.fromEntries(Object.keys(elements).map(e => [e, 0]));
                teamMembers.forEach(e => {
                    elementCounts[e.element]++;
                });

                currentTeam.synergies = initialTeam.synergies.map(e => ({
                    element: { type: e.element.type },
                    bonus_multiplier: e.harem_bonus_multiplier + e.team_bonus_per_girl * elementCounts[e.element.type]
                }));

                const theme = Object.entries(elementCounts).filter(([_, count]) => count >= 3).map(([type, _]) => type);
                currentTeam.theme_elements = theme.map(e => elements[e]);
                currentTeam.theme = theme.join(',');

                if (theme.length > 0) {
                    const balancedBonus = theme_resonance_bonuses[''];
                    if (balancedBonus) {
                        const { defense, chance } = balancedBonus;
                        if (defense) caracs.defense /= Math.pow(1.02, defense / 2);
                        if (chance) caracs.chance /= Math.pow(1.04, chance / 4);
                    }
                    theme.forEach(element => {
                        const bonus = theme_resonance_bonuses[element];
                        if (bonus) {
                            const { defense, chance } = bonus;
                            if (defense) caracs.defense *= Math.pow(1.02, defense / 2);
                            if (chance) caracs.chance *= Math.pow(1.04, chance / 4);
                        }
                    });
                }

                currentTeam.caracs = caracs;
                update();
            }

            function update() {
                const _hasAssumptions = hasAssumptions;
                const player = calcBattleDataFromTeams(currentTeam, opponentTeam, mythicBoosterMultiplier);
                const opponent = calcBattleDataFromTeams(opponentTeam, currentTeam);
                const resultPromise = simulateFromBattleData(player, opponent).then(result => {
                    result.hasAssumptions = _hasAssumptions;
                    return result;
                });

                $('.player_team_block.battle_hero').find('.sim-result').remove();
                const $iconArea = $('.player_team_block.battle_hero .icon-area');
                $iconArea.before(createChanceElement$(resultPromise, player, opponent).addClass('sim-left'));
                if (battleType === 'leagues') $iconArea.before(createLeaguePointsElement$(resultPromise).addClass('sim-right'));
            }
        }

        function getLastOpponentTeam(battleType) {
            if (!['leagues', 'trolls', 'pantheon'].includes(battleType)) return null;

            const lastOpponentId = localStorageGetItem('HHBattleSimulatorLastOpponentId');
            if (battleType === 'leagues') {
                if (localStorageGetItem('leagues_id') != lastOpponentId) return null;
            }
            if (battleType === 'trolls') {
                if (localStorageGetItem('troll_id') != lastOpponentId) return null;
            }
            if (battleType === 'pantheon') {
                if (localStorageGetItem('pantheon_id') != lastOpponentId) return null;
            }

            const lastOpponentTeam = localStorageGetItem('HHBattleSimulatorLastOpponentTeam');
            if (lastOpponentTeam == null) return null;

            return JSON.parse(lastOpponentTeam);
        }

        function getMythicBoosterMultiplier(battleType) {
            const mythicBoosters = JSON.parse(localStorage.HHPlusPlusBoosterStatus ?? null)?.mythic?.map(e => e.item?.identifier);
            // 'MB2': AME, 'MB3': Headband, 'MB8': LME, 'MB9': SME
            if (['leagues'].includes(battleType) && ['MB2', 'MB8'].some(e => mythicBoosters.includes(e))) {
                return 1.15;
            }
            if (['seasons'].includes(battleType) && ['MB2', 'MB9'].some(e => mythicBoosters.includes(e))) {
                return 1.15;
            }
            if (['pantheon', 'trolls'].includes(battleType) && ['MB3'].some(e => mythicBoosters.includes(e))) {
                return 1.25;
            }
            return 1;
        }
    }

    async function saveLastOpponentTeam() {
        if (checkPage('/leagues-pre-battle.html', '/troll-pre-battle.html', '/pantheon-pre-battle.html')) {
            const id = location.search.match(/id_opponent=(\d+)/)?.[1];
            if (id == null) return;

            const { opponent_fighter } = window;
            if (opponent_fighter == null) throw new Error('opponent_fighter is not found');

            const opponentTeam = opponent_fighter?.player?.team;
            if (opponentTeam == null) throw new Error('opponent_fighter.player.team is not found');

            await afterGameInited;

            const beforeChangeTeam = new Promise(resolve => {
                document.getElementById('change_team')?.addEventListener('click', () => {
                    resolve();
                }, true);
            });
            await beforeChangeTeam;

            localStorageSetItem('HHBattleSimulatorLastOpponentId', opponent_fighter.player.id_fighter);
            localStorageSetItem('HHBattleSimulatorLastOpponentTeam', JSON.stringify(opponentTeam));
            if (checkPage('/leagues-pre-battle.html')) {
                localStorageSetItem('battle_type', 'leagues');
                localStorageSetItem('leagues_id', id);
            }
            if (checkPage('/troll-pre-battle.html')) {
                localStorageSetItem('battle_type', 'trolls');
                localStorageSetItem('troll_id', id);
            }
            if (checkPage('/pantheon-pre-battle.html')) {
                localStorageSetItem('battle_type', 'pantheon');
                localStorageSetItem('pantheon_id', id);
            }
        }
    }

    async function savePlayerLeaguesTeam() {
        if (checkPage('/teams.html')) {
            const { teams_data } = window;
            if (teams_data == null) throw new Error('teams_data is not found');

            const leaguesTeam = Object.values(teams_data).find(team => team.selected_for_battle_type.includes('leagues'));
            if (leaguesTeam != null) {
                localStorageSetItem('HHBattleSimulatorPlayerLeaguesTeam', JSON.stringify(leaguesTeam));
            }

            const selectButton = document.getElementById('btn-select-team');
            selectButton?.addEventListener('click', () => {
                if (localStorageGetItem('battle_type') === 'leagues') {
                    const selectedIndex = document.querySelector('.selected-team')?.dataset.teamIndex;
                    const selectedTeam = teams_data[selectedIndex];
                    localStorageSetItem('HHBattleSimulatorPlayerLeaguesTeam', JSON.stringify(selectedTeam ?? null));
                }
            }, true);
        }
    }

    async function fetchPlayerLeaguesTeam() {
        if (!document.referrer.includes('teams.html')) {
            try {
                const teamsPage = await fetch('teams.html');
                const teamsHtml = await teamsPage.text();
                const match = teamsHtml.match(/var\s+teams_data\s+=\s+(\{.*?\});/);
                if (match) {
                    const teams_data = JSON.parse(match[1]);
                    const leaguesTeam = Object.values(teams_data).find(team => team.selected_for_battle_type.includes('leagues'));
                    if (leaguesTeam != null) return leaguesTeam;
                }
            } catch (e) { }
        }
        const lastSelectedTeam = localStorageGetItem('HHBattleSimulatorPlayerLeaguesTeam');
        return JSON.parse(lastSelectedTeam ?? null);
    }

    async function changePowerSortToSimSort() {
        if (checkPage('/tower-of-fame.html')) {
            const { opponents_list, Hero } = window;
            if (opponents_list == null) throw new Error('opponents_list is not found');

            const playerId = Hero?.infos?.id;
            if (playerId == null) throw new Error('Hero.infos.id is not found');

            const player = opponents_list.find(e => e.player.id_fighter == playerId);
            if (player == null) return;

            const playerBoosters = player.boosters ?? [];
            const mythicBoosterMultiplier = playerBoosters.some(e => ['MB2', 'MB8'].includes(e.item.identifier)) ? 1.15 : 1;

            const playerTeam = await fetchPlayerLeaguesTeam();
            if (playerTeam == null) return;

            const opponents = opponents_list
                .filter(opponent => opponent.player.id_fighter != playerId);

            const resultsPromise = opponents.map(opponent => (
                window.HHBattleSimulator
                    .simulateFromTeams(playerTeam, opponent.player.team, mythicBoosterMultiplier)
                    .then(result => [opponent.player.id_fighter, result])
            ));

            await afterGameInited;

            const results = await Promise.all(resultsPromise);
            const resultMap = Object.fromEntries(results);

            const replacePowerDataWithSimResult = () => {
                opponents_list.forEach(opponent => {
                    opponent.power = resultMap[opponent.player.id_fighter]?.avgPoints ?? 0;
                });
            };
            replacePowerDataWithSimResult();

            const $challengesHeader = $('.league_table .head-column[column="match_history_sorting"] > span');
            const expectedPoints = opponents.reduce((p, c) => {
                const matchHistory = Object.values(c.match_history)[0]?.filter(e => e != null) ?? [];
                const knownPoints = matchHistory.reduce((p, c) => p + parseInt(c.match_points), 0);
                const remainingChallenges = 3 - matchHistory.length;
                return p + knownPoints + c.power * remainingChallenges;
            }, 0);
            $challengesHeader.attr('tooltip', `Score expected: ${toRoundedNumber(expectedPoints, 10)}`);

            const $powerHeader = $('.league_table .head-column[column="power"] > span');
            $powerHeader.html($powerHeader.html().replace('Power', 'Sim'));
            const sumPoints = results.reduce((p, c) => p + c[1].avgPoints, 0) * 3;
            $powerHeader.attr('tooltip', `Sum: ${toRoundedNumber(sumPoints, 10)}`);

            const replacePowerViewWithSimResult = () => {
                const { opponents_list } = window;
                const $rows = $('.data-row.body-row');
                opponents_list.forEach((opponent, i) => {
                    let $columnContent = $('<div></div>').addClass('sim-column');
                    const result = resultMap[opponent.player.id_fighter];
                    if (result != null) {
                        let mark = '';
                        if (result.minPoints >= 25) mark = '<div class="vCheck_mix_icn sim-mark"></div>';
                        $columnContent
                            .html(`${mark}${toRoundedNumber(result.avgPoints, 100)}`)
                            .css('color', getRiskColor(result.avgPoints / 25));
                    } else {
                        $columnContent.text('-');
                    }
                    $rows.eq(i).find('.data-column[column=power]').empty().append($columnContent);
                });
            };
            replacePowerViewWithSimResult();

            const header = $powerHeader[0];
            if (header != null) {
                const observer = new MutationObserver(() => {
                    replacePowerDataWithSimResult();
                    replacePowerViewWithSimResult();
                });
                observer.observe(header, { childList: true, subtree: true });
            }

            const table = document.querySelector('.league_table .data-list');
            if (table != null) {
                const observer = new MutationObserver(() => {
                    replacePowerViewWithSimResult();
                });
                observer.observe(table, { childList: true });
            }
        }
    }
})();

function addStyle() {
    $(document.head).append(`<style>
.sim-result {
    width: max-content;
    height: 0;
    position: relative;
    bottom: 1.25rem;
    line-height: 1.25rem;
    text-align: center;
    text-shadow: -1px -1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, 1px 1px 0 #000;
    z-index: 1;
}
.sim-result .sim-label {
    font-size: 0.75rem;
}
.sim-result.sim-left {
    margin-right: 60%;
}
.sim-result.sim-right {
    margin-left: 60%;
}
.sim-result.sim-top {
    bottom: 11.5rem;
    line-height: 1rem;
}
.sim-result.sim-pending {
    color: #999;
}
.sim-mark {
    display: inline-block;
    width: 1.5rem;
    height: 1.5rem;
    margin: -0.5rem 0.25rem 0 -1.5rem;
    background-size: 1.5rem;
    vertical-align: bottom;
}
table.sim-table {
    border-collapse: collapse;
    color: #FFF;
    background-color: #000;
    font-size: 0.75rem;
}
table.sim-table td {
    padding: 0.25rem;
    border: 1px solid #999;
}
.sim-column {
    text-align: center;
}
</style>`);
}
