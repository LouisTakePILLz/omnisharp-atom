var fs = require('fs');
var _ = require('lodash');
var modelLocation = './node_modules/omnisharp-server-roslyn-binaries/omnisharp-roslyn/src/OmniSharp/Models';
var models = [];

var dictionaryRegex = /IDictionary<(.*?), (.*?)>/;
var listRegex = /IList<(.*?)>/;
var collectionRegex = /ICollection<(.*?)>/;
var enumerableRegex = /IEnumerable<(.*?)>/;

var getterSetterRegex = /^\s*public (.*?) \{ get; set; \}/;
var getterRegex = /^\s*public (.*?) \{ get; \}/;
var filepathRegex = /^\s*public string FileName$/;

var inheritsRegex = /class .*? \: (.*?)$/;

function inferPropertyType(property) {
    var dictionary = property.match(dictionaryRegex);
    if (dictionary) {
        return '{ [ key: '+dictionary[1]+' ]: '+dictionary[2]+' }';
    }
    var array = property.match(listRegex) || property.match(collectionRegex) || property.match(enumerableRegex);
    if (array) {
        return array[1] + '[]';
    }

    if (property === 'Guid')
        return 'string';

    if (property === 'bool')
        return 'boolean';

    if (property === 'int' || property === 'int?')
        return 'number';

    if (property === "TestCommandType")
        return 'any';

    return property;
}

module.exports = function() {
    var files = fs.readdirSync(modelLocation);

    files.forEach(function(file) {
        if (file.indexOf('.cs') === -1) {
            return;
        }

        var properties = [];

        var name = file.replace('.cs','.d.ts');
        var modelName = name.replace('.d.ts', '');
        var content = fs.readFileSync(modelLocation + '/' + file).toString('utf-8').split('\n');
        var inheritsFrom = '';

        while (content.length) {
            var row = content.shift();
            var result = row.match(getterSetterRegex) || row.match(getterRegex) || (row.match(filepathRegex) && ['', 'string FileName']);
            if (result) {
                var property = result[1].split(' ');

                var propertyName = property.pop();
                propertyName = propertyName;
                var type = property.join(' ');

                properties.push(propertyName + (_.endsWith(type, '?') ? '?' : '?') + ': ' + inferPropertyType(type));
            }

            var inherits = row.match(inheritsRegex);
            if (inherits) {
                inheritsFrom = inherits[1];
                if (inheritsFrom .indexOf('IComparable') > -1)
                    inheritsFrom = '';
            }
        }

        var lines = [];
        lines.push('interface ' + modelName + (inheritsFrom && ' extends ' + inheritsFrom || '') +' {');
        properties.forEach(function(property) {
            lines.push('    ' + property + ';');
        });
        lines.push('}');

        models.push(lines);
    });

    var fileContent = 'declare module OmniSharp {\n';
    models.forEach(function(model) {
        fileContent += model.map(function(z) { return '    ' + z; }).join('\n') + '\n\n';
    });
    fileContent += '\n}\n';

    fs.writeFileSync('./lib/models.d.ts', fileContent);
};
