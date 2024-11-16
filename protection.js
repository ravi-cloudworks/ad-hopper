// protection.js - Place this in your project root
(function() {
    // Disable right click
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    // Disable DevTools shortcuts
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && 
            (e.key === 'S' || 
             e.key === 's' || 
             e.key === 'C' || 
             e.key === 'c' || 
             e.key === 'I' || 
             e.key === 'i' || 
             e.key === 'J' || 
             e.key === 'j' || 
             e.key === 'U' || 
             e.key === 'u')) {
            e.preventDefault();
        }
    });

    // Disable F12
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F12') {
            e.preventDefault();
        }
    });

    // Clear console
    console.clear = function() {};
    
    // Disable source map viewing
    window.addEventListener('load', function() {
        setTimeout(function() {
            var scripts = document.getElementsByTagName('script');
            for(var i = 0; i < scripts.length; i++) {
                if(scripts[i].getAttribute('src')) {
                    scripts[i].removeAttribute('src');
                }
            }
        }, 1000);
    });
})();
