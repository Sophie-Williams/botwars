import bodyParser from "body-parser";
import express from "express";
import expressWs from "../models/utils/express-ws";

import GameRegistry from "../models/game_registry";

export default function(Game) {
  var engine = new GameRegistry(Game);

  var router = expressWs(new express.Router());
  router.use(bodyParser.json());

  router.param('gameId', function(req, res, next, gameId) {
    var game = engine.getGameInstance(gameId);
    if(!game) { res.status(404).send('The requested game does not exist'); return; }
    req.game = game;

    if(req.query.playerId) {
      var player = game.getPlayer(req.query.playerId);
      if(!player) { res.status(404).send('Invalid player'); return; }
      req.player = player;
    }

    next();
  });

  router.post('/create', function(req, res) {
    var gameId = engine.createNewGame(req.body);

    if(!gameId) res.status(400).send('Could not create new game');
    else res.json({ gameId: gameId });
  });

  router.post('/:gameId/register', function(req, res) {
    var playerRes = req.game.registerNewPlayer();

    if(!playerRes) res.status(400).send('Could not register new player');
    else res.json(playerRes);
  });

  router.get('/:gameId/connect', function(req, res) {
    req.game.connect(req.player);
    res.send('Connected');
  });

  router.get('/:gameId/state', function(req, res) {
    if(!req.game.hasStarted()) res.status(400).send('Game has not started yet');
    else res.json(req.game.getFullState());
  });

  router.post('/:gameId/move', function(req, res) {
    if(!req.game.hasStarted()) res.status(400).send('Game has not started yet');
    else if(req.game.move(req.player, req.body)) res.send("OK");
    else res.status(400).send('Illegal move');
  });

  router.ws('/:gameId/stream', function(ws, req) {
    ws.sendJSON = function(obj) { ws.send(JSON.stringify(obj)); };
    var {game, player} = req;

    game.on('start', function() {
      ws.sendJSON({ eventType: 'start', state: game.getFullState() });
    });

    game.on('stateChange', function() {
      ws.sendJSON({ eventType: 'state', state: game.getFullState() });
    });

    game.on('move', function(player, move) {
      ws.sendJSON({ eventType: 'move', player: player, move: move });
    });

    game.on('end', function() {
      ws.sendJSON({ eventType: 'end', state: game.getFullState() });
      ws.close();
    });

    if(game.hasStarted()) {
      var isEnded = game.isEnded();
      ws.sendJSON({ eventType: isEnded ? 'end' : 'state', state: game.getFullState() });
      if(isEnded) ws.close();
    }

    if(player) {
      game.on('waitingForMove', function(nextPlayer) {
        if(nextPlayer == player)
          ws.sendJSON({ eventType: 'requestMove', state: game.getFullState() });
      });

      ws.on('message', function(msg) {
        game.move(player, JSON.parse(msg));
      });

      if (game.hasStarted() && player == game.getNextPlayer()) {
        ws.sendJSON({ eventType: 'requestMove', state: game.getFullState() });
      }

      game.connect(player);
    }
  });

  return router;
}
