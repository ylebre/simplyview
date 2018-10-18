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
this.simply = (function(simply, global) {

    var routeInfo = [];

    function parseRoutes(routes) {
        var paths = Object.keys(routes);
        var matchParams = /:(\w+|\*)/g;
        var matches, params, path;
        for (var i=0; i<paths.length; i++) {
            path    = paths[i];
            matches = [];
            params  = [];
            do {
                matches = matchParams.exec(path);
                if (matches) {
                    params.push(matches[1]);
                }
            } while(matches);
            routeInfo.push({
                match:  new RegExp(path.replace(/:\w+/, '([^/]+)').replace(/:\*/, '(.*)')),
                params: params,
                action: routes[path]
            });
        }
    }

    simply.route = {
        load: function(routes) {
            parseRoutes(routes);
        },
        match: function(path, options) {
            var matches;
            for ( var i=0; i<routeInfo.length; i++) {
                if (path[path.length-1]!='/') {
                    matches = routeInfo[i].match.exec(path+'/');
                    if (matches) {
                        path+='/';
                        history.replaceState({}, '', path);
                    }
                }
                matches = routeInfo[i].match.exec(path);
                if (matches && matches.length) {
                    var params = {};
                    routeInfo[i].params.forEach(function(key, i) {
                        if (key=='*') {
                            key = 'remainder';
                        }
                        params[key] = matches[i+1];
                    });
                    Object.assign(params, options);
                    return routeInfo[i].action.call(simply.route, params);
                }
            }
        },
        goto: function(path) {
            history.pushState({},'',path);
            return simply.route.match(path);
        },
        has: function(path) {
            for ( var i=0; i<routeInfo.length; i++) {
                var matches = routeInfo[i].match.exec(path);
                if (matches && matches.length) {
                    return true;
                }
            }
            return false;
        }
    };

    global.addEventListener('popstate', function() {
        simply.route.match(document.location.pathname);
    });

    var linkHandler = function(evt) {
        if (evt.ctrlKey) {
            return;
        }
        var link = evt.target;
        while (link && link.tagName!='A') {
            link = link.parentElement;
        }
        if (link 
            && link.pathname 
            && link.hostname==document.location.hostname 
            && !link.link
            && !link.dataset.simplyCommand
            && simply.route.has(link.pathname)
        ) {
            simply.route.goto(link.pathname);
            evt.preventDefault();
            return false;
        }
    };

    document.addEventListener('click', linkHandler);

    return simply;

})(this.simply || {}, this);
this.simply = (function(simply) {

    simply.path = {
        get: function(model, path) {
            if (!path) {
                return model;
            }
            return path.split('.').reduce(function(acc, name) {
                return (acc && acc[name] ? acc[name] : null);
            }, model);
        },
        set: function(model, path, value) {
            var lastName   = simply.path.pop(path);
            var parentPath = simply.path.parent(path);
            var parentOb   = simply.path.get(model, parentPath);
            parentOb[lastName] = value;
        },
        pop: function(path) {
            return path.split('.').pop();
        },
        push: function(path, name) {
            return (path ? path + '.' : '') + name;
        },
        parent: function(path) {
            var p = path.split('.');
            p.pop();
            return p.join('.');
        },
        parents: function(path) {
            var result = [];
            path.split('.').reduce(function(acc, name) {
                acc.push( (acc.length ? acc[acc.length-1] + '.' : '') + name );
                return acc;
            },result);
            return result;
        }
    };

    return simply;
})(this.simply || {});
this.simply = (function(simply, global) {

    simply.view = function(app, view) {

        app.view = view || {};

        var load = function() {
            var data = app.view;
            var path = editor.data.getDataPath(app.container);
            app.view = editor.currentData[path];
            Object.keys(data).forEach(function(key) {
                app.view[key] = data[key];
            });
        };

        if (global.editor && editor.currentData) {
            load();
        } else {
            document.addEventListener('simply-content-loaded', function() {
                load();
            });
        }
        
        return app.view;
    };

    return simply;
})(this.simply || {}, this);
this.simply = (function(simply, global) {
    simply.app = function(options) {
        if (!options) {
            options = {};
        }
        if (!options.container) {
            console.warn('No simply.app application container element specified, using document.body.');
        }
        
        function simplyApp(options) {
            if (!options) {
                options = {};
            }
            if ( options.routes ) {
                simply.route.load(options.routes);
                global.setTimeout(function() {
                    simply.route.match(global.location.pathname);
                });
            }
            this.container = options.container  || document.body;
            this.actions   = simply.action ? simply.action(this, options.actions) : false;
            this.commands  = simply.command ? simply.command(this, options.commands) : false;
			this.resize    = simply.resize ? simply.resize(this, options.resize) : false;
            this.view      = simply.view ? simply.view(this, options.view) : false;
            if (!(global.editor && global.editor.field) && simply.bind) {
				// skip simplyview databinding if SimplyEdit is loaded
                options.bind = simply.render(options.bind || {});
                options.bind.model = this.view;
                options.bind.container = this.container;
                this.bind = options.bindings = simply.bind(options.bind);
            }
        }

        simplyApp.prototype.get = function(id) {
            return this.container.querySelector('[data-simply-id='+id+']') || document.getElementById(id);
        };

        var app = new simplyApp(options);

        return app;
    };

    return simply;
})(this.simply || {}, this);
this.simply = (function(simply, global) {
    var handlers = [
        {
            match: 'input,select,textarea',
            get: function(el) {
                return el.dataset.simplyValue || el.value;
            },
            check: function(el, evt) {
                return evt.type=='change' || (el.dataset.simplyImmediate && evt.type=='input');
            }
        },
        {
            match: 'a,button',
            get: function(el) {
                return el.dataset.simplyValue || el.href || el.value;
            },
            check: function(el,evt) {
                return evt.type=='click' && evt.ctrlKey==false && evt.button==0;
            }
        },
        {
            match: 'form',
            get: function(el) {
                var data = {};
                [].forEach.call(el.elements, function(el) {
                    if (el.name) {
                        data[el.name] = el.value;
                    }
                });
                return data;//new FormData(el);
            },
            check: function(el,evt) {
                return evt.type=='submit';
            }
        }
    ];

    var fallbackHandler = {
        get: function(el) {
            return el.dataset.simplyValue;
        },
        check: function(el, evt) {
            return evt.type=='click' && evt.ctrlKey==false && evt.button==0;
        }
    };

    function getCommand(evt) {
        var el = evt.target.closest('[data-simply-command]');
        if (el) {
            var matched = false;
            for (var i=handlers.length-1; i>=0; i--) {
                if (el.matches(handlers[i].match)) {
                    matched = true;
                    if (handlers[i].check(el, evt)) {
                        return {
                            name:   el.dataset.simplyCommand,
                            source: el,
                            value:  handlers[i].get(el)
                        };
                    }
                }
            }
            if (!matched && fallbackHandler.check(el,evt)) {
                return {
                    name:   el.dataset.simplyCommand,
                    source: el,
                    value: fallbackHandler.get(el)
                };
            }
        }
        return null;
    }

    simply.command = function(app, inCommands) {

        var commands = {};
        for (var i in inCommands) {
            commands[i] = inCommands[i];
        }

        commands.app = app;

        commands.action = function(name) {
            var params = Array.prototype.slice.call(arguments);
            params.shift();
            return app.actions[name].apply(app.actions,params);
        };

        commands.call = function(name) {
            var params = Array.prototype.slice.call(arguments);
            params.shift();
            return this[name].apply(this,params);            
        };

        commands.appendHandler = function(handler) {
            handlers.push(handler);
        };

        commands.prependHandler = function(handler) {
            handlers.unshift(handler);
        };

        var commandHandler = function(evt) {
            var command = getCommand(evt);
            if ( command ) {
                if (!commands[command.name]) {
                    console.error('simply.command: undefined command '+command.name, command.source);
                } else {
                    commands.call(command.name, command.source, command.value);
                    evt.preventDefault();
                    evt.stopPropagation();
                    return false;
                }
            }
        };

        app.container.addEventListener('click', commandHandler);
        app.container.addEventListener('submit', commandHandler);
        app.container.addEventListener('change', commandHandler);
        app.container.addEventListener('input', commandHandler);

        return commands;
    };

    return simply;
    
})(this.simply || {}, this);
