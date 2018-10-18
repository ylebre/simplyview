this.simply = (function(simply, global) {
    simply.action = function(app, inActions) {
        var actions = {};
        for ( var i in inActions ) {
            actions[i] = inActions[i];
        }

        actions.app = app;
        actions.call = function(name) {
            var params = Array.prototype.slice.call(arguments);
            params.shift();
            return this[name].apply(this, params);
        };
        return actions;
    };

    return simply;
    
})(this.simply || {}, this);
